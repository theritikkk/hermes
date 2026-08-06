import type { EventBridgeEvent, Handler } from 'aws-lambda';
import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EventTypes } from '@hermes/domain';

interface IntegrationEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  tenantId: string;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const handler: Handler = async (event: EventBridgeEvent<string, IntegrationEvent>) => {
  const detail = event.detail;
  const tableName = process.env.EXECUTION_READ_MODEL_TABLE!;
  const pk = `TENANT#${detail.tenantId}`;
  const sk = `EXEC#${detail.correlationId}`;

  try {
    switch (detail.eventType) {
      case EventTypes.WorkflowExecutionStarted:
        await doc.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET #status = :running, workflowName = :wfName, workflowVersion = :wfVersion, assetId = :assetId, s3Key = :s3Key, startedAt = :startedAt, tenantId = :tenantId, updatedAt = :now, lastEventId = :eventId',
          ConditionExpression: 'attribute_not_exists(#status) OR #status = :pending',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':running': 'RUNNING',
            ':wfName': detail.payload.workflowName,
            ':wfVersion': detail.payload.workflowVersion,
            ':assetId': detail.payload.assetId,
            ':s3Key': detail.payload.s3Key,
            ':startedAt': detail.occurredAt,
            ':tenantId': detail.tenantId,
            ':now': detail.occurredAt,
            ':eventId': detail.eventId,
            ':pending': 'PENDING',
          },
        }));
        break;

      case EventTypes.StepCompleted:
        await doc.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET steps.#stepName = :stepState, updatedAt = :now, lastEventId = :eventId',
          ExpressionAttributeNames: { '#stepName': detail.payload.stepName as string },
          ExpressionAttributeValues: {
            ':stepState': {
              status: 'completed',
              output: detail.payload.output,
              completedAt: detail.occurredAt,
            },
            ':now': detail.occurredAt,
            ':eventId': detail.eventId,
          },
        }));
        break;

      case EventTypes.StepFailed:
        await doc.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET steps.#stepName = :stepState, updatedAt = :now, lastEventId = :eventId',
          ExpressionAttributeNames: { '#stepName': detail.payload.stepName as string },
          ExpressionAttributeValues: {
            ':stepState': {
              status: 'failed',
              error: detail.payload.error,
              completedAt: detail.occurredAt,
            },
            ':now': detail.occurredAt,
            ':eventId': detail.eventId,
          },
        }));
        break;

      case EventTypes.WorkflowExecutionCompleted:
        await doc.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET #status = :completed, completedAt = :now, updatedAt = :now, lastEventId = :eventId',
          ConditionExpression: '#status = :running',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':completed': 'COMPLETED',
            ':now': detail.occurredAt,
            ':eventId': detail.eventId,
            ':running': 'RUNNING',
          },
        }));
        break;

      case EventTypes.WorkflowExecutionFailed:
        await doc.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET #status = :failed, failureReason = :reason, completedAt = :now, updatedAt = :now, lastEventId = :eventId',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':failed': 'FAILED',
            ':reason': detail.payload.reason,
            ':now': detail.occurredAt,
            ':eventId': detail.eventId,
          },
        }));
        break;

      default:
        return;
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'execution-projection',
      message: 'execution projection updated',
      tenantId: detail.tenantId,
      executionId: detail.correlationId,
      eventType: detail.eventType,
      eventId: detail.eventId,
    }));

  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        service: 'execution-projection',
        message: 'execution projection update skipped (conditional check failed)',
        tenantId: detail.tenantId,
        executionId: detail.correlationId,
        eventType: detail.eventType,
        eventId: detail.eventId,
      }));
    } else {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        service: 'execution-projection',
        message: 'execution projection update failed',
        tenantId: detail.tenantId,
        executionId: detail.correlationId,
        eventType: detail.eventType,
        eventId: detail.eventId,
        error: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  }
};
