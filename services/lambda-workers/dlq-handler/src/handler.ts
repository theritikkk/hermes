/**
 * dlq-handler
 *
 * Consumes messages from the outbox DLQ. For each message it:
 *  1. Parses and classifies the message (transient / poison / unknown).
 *  2. Logs a structured CRITICAL entry for alarm ingestion.
 *  3. Persists the failed event to a DynamoDB "dead-events" item in the
 *     event store (PK=DLQ#{queueName}, SK=MSG#{messageId}) for audit and
 *     manual redrive tooling.
 *  4. Emits a CloudWatch EMF metric per (queue, tenantId, classification).
 *
 * Messages are NOT deleted by this handler  SQS handles deletion after a
 * successful Lambda return. Throwing causes the message to remain on the DLQ
 * for the configured retention period (7 days).
 *
 * Poison classification:
 *  - receiveCount >= POISON_THRESHOLD (default 5)  POISON
 *  - otherwise                                     TRANSIENT
 */
import type { SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '@hermes/observability';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const POISON_THRESHOLD = parseInt(process.env.POISON_THRESHOLD ?? '5', 10);

type Classification = 'POISON' | 'TRANSIENT' | 'UNKNOWN';

interface ParsedMessage {
  tenantId: string;
  eventId?: string;
  eventType?: string;
  originalBody: unknown;
  errorContext?: unknown;
}

function parseMessage(rawBody: string): ParsedMessage {
  try {
    const outer = JSON.parse(rawBody);
    const inner =
      typeof outer.originalMessage === 'string'
        ? JSON.parse(outer.originalMessage)
        : (outer.originalMessage ?? outer);

    return {
      tenantId: (inner.tenantId ?? outer.tenantId ?? 'unknown') as string,
      eventId: (inner.eventId ?? outer.eventId) as string | undefined,
      eventType: (inner.eventType ?? outer.eventType) as string | undefined,
      originalBody: inner,
      errorContext: outer.errorContext ?? null,
    };
  } catch {
    return { tenantId: 'unknown', originalBody: rawBody };
  }
}

function classify(receiveCount: number): Classification {
  if (receiveCount >= POISON_THRESHOLD) return 'POISON';
  if (receiveCount > 0) return 'TRANSIENT';
  return 'UNKNOWN';
}

export const handler = async (event: SQSEvent): Promise<void> => {
  const tableName = process.env.EVENT_STORE_TABLE;

  for (const record of event.Records) {
    const receiveCount = parseInt(
      record.attributes?.ApproximateReceiveCount ?? '0',
      10,
    );
    const queueName =
      (record.eventSourceARN ?? '').split(':').pop() ??
      process.env.DLQ_NAME ??
      'unknown';

    const parsed = parseMessage(record.body);
    const classification: Classification = classify(receiveCount);

    const log = createLogger({
      service: 'dlq-handler',
      tenantId: parsed.tenantId,
      correlationId: parsed.eventId,
    });

    log.critical('DLQ message received', {
      queue: queueName,
      messageId: record.messageId,
      receiveCount,
      classification,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      errorContext: parsed.errorContext,
    });

    // Persist to event store for audit + redrive tooling
    if (tableName) {
      try {
        await dynamo.send(new PutCommand({
          TableName: tableName,
          Item: {
            PK: `DLQ#${queueName}`,
            SK: `MSG#${record.messageId}`,
            itemType: 'DLQ_EVENT',
            classification,
            messageId: record.messageId,
            receiveCount,
            tenantId: parsed.tenantId,
            eventId: parsed.eventId,
            eventType: parsed.eventType,
            originalBody: parsed.originalBody,
            errorContext: parsed.errorContext,
            queueName,
            arrivedAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 day TTL
          },
          // Don't overwrite if already persisted (duplicate delivery)
          ConditionExpression: 'attribute_not_exists(SK)',
        }));

        log.info('DLQ event persisted for audit', { messageId: record.messageId, classification });
      } catch (err: unknown) {
        const isConditionalCheck =
          err instanceof Error && err.name === 'ConditionalCheckFailedException';
        if (!isConditionalCheck) {
          log.error('failed to persist DLQ event', err, { messageId: record.messageId });
          // Non-fatal: logging + metric still proceed
        }
      }
    }

    // CloudWatch EMF metric  one per message
    console.log(JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [{
          Namespace: 'Hermes/Operations',
          Dimensions: [['queue', 'tenantId', 'classification']],
          Metrics: [{ Name: 'DLQMessageCount', Unit: 'Count' }],
        }],
      },
      queue: queueName,
      tenantId: parsed.tenantId,
      classification,
      DLQMessageCount: 1,
    }));
  }
};
