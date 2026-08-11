/**
 * usage-projection
 *
 * Maintains per-tenant monthly usage counters in DynamoDB:
 *   PK = USAGE#<tenantId>
 *   SK = MONTH#<YYYY-MM>
 *
 * Attributes updated atomically with ADD (counter):
 *   - executionsStarted   (on WorkflowExecutionStarted)
 *   - executionsCompleted (on WorkflowExecutionCompleted)
 *   - executionsFailed    (on WorkflowExecutionFailed)
 *   - executionsCancelled (on ExecutionCancelled)
 *   - executionsTimedOut  (on ExecutionTimedOut)
 *   - executionsRetried   (on ExecutionRetried)
 *   - stepsCompleted      (on StepCompleted)
 *   - stepsFailed         (on StepFailed)
 *   - retriesScheduled    (on RetryScheduled)
 *   - snapshotsCreated    (on SnapshotCreated)
 *   - webhooksDelivered   (on WebhookDelivered)
 *   - notificationsSent   (on NotificationSent)
 */
import type { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EventTypes } from '@hermes/domain';
import { createLogger } from '@hermes/observability';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

interface IntegrationEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function counterField(eventType: string): string | null {
  switch (eventType) {
    case EventTypes.WorkflowExecutionStarted:   return 'executionsStarted';
    case EventTypes.WorkflowExecutionCompleted: return 'executionsCompleted';
    case EventTypes.WorkflowExecutionFailed:    return 'executionsFailed';
    case EventTypes.ExecutionCancelled:        return 'executionsCancelled';
    case EventTypes.ExecutionTimedOut:          return 'executionsTimedOut';
    case EventTypes.ExecutionRetried:           return 'executionsRetried';
    case EventTypes.StepCompleted:              return 'stepsCompleted';
    case EventTypes.StepFailed:                 return 'stepsFailed';
    case EventTypes.RetryScheduled:             return 'retriesScheduled';
    case EventTypes.SnapshotCreated:            return 'snapshotsCreated';
    case EventTypes.WebhookDelivered:           return 'webhooksDelivered';
    case EventTypes.NotificationSent:            return 'notificationsSent';
    default:                                    return null;
  }
}

export const handler = async (
  event: EventBridgeEvent<string, IntegrationEvent>,
): Promise<void> => {
  const detail = event.detail;
  const tableName = process.env.EXECUTION_READ_MODEL_TABLE;

  if (!tableName) throw new Error('Missing EXECUTION_READ_MODEL_TABLE');

  const log = createLogger({
    service: 'usage-projection',
    tenantId: detail.tenantId,
    correlationId: detail.correlationId,
  });

  const field = counterField(detail.eventType);
  if (!field) {
    // Event type not relevant to usage counters
    return;
  }

  const month = monthKey(detail.occurredAt);
  const pk = `USAGE#${detail.tenantId}`;
  const sk = `MONTH#${month}`;

  await dynamo.send(new UpdateCommand({
    TableName: tableName,
    Key: { PK: pk, SK: sk },
    UpdateExpression:
      'ADD #counter :one SET tenantId = :tenantId, #month = :month, updatedAt = :now',
    ExpressionAttributeNames: {
      '#counter': field,
      '#month': 'month',
    },
    ExpressionAttributeValues: {
      ':one': 1,
      ':tenantId': detail.tenantId,
      ':month': month,
      ':now': new Date().toISOString(),
    },
  }));

  log.info('usage counter incremented', {
    tenantId: detail.tenantId,
    month,
    field,
    eventType: detail.eventType,
  });

  // CloudWatch EMF metric
  console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: 'Hermes/Usage',
        Dimensions: [['tenantId', 'eventType']],
        Metrics: [{ Name: 'UsageEventProcessed', Unit: 'Count' }],
      }],
    },
    tenantId: detail.tenantId,
    eventType: detail.eventType,
    UsageEventProcessed: 1,
  }));
};
