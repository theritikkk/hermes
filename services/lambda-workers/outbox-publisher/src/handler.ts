import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const eventBridge = new EventBridgeClient({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const log = (level: string, message: string, fields: Record<string, unknown>) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'outbox-publisher', message, ...fields }));

export const handler = async (event: SQSEvent) => {
  const busName = process.env.EVENT_BUS_NAME;
  const tableName = process.env.EVENT_STORE_TABLE;

  if (!busName || !tableName) {
    throw new Error('Missing EVENT_BUS_NAME or EVENT_STORE_TABLE');
  }

  for (const record of event.Records) {
    let ddbRecord;
    try {
      ddbRecord = JSON.parse(record.body);
    } catch (err) {
      log('ERROR', 'Failed to parse SQS body', { error: String(err), body: record.body });
      continue;
    }

    if (!ddbRecord.dynamodb?.NewImage) {
      continue;
    }

    const newImage = unmarshall(ddbRecord.dynamodb.NewImage as any);

    if (newImage.outboxStatus !== 'PENDING') {
      continue;
    }

    const detail = {
      eventId: newImage.eventId,
      eventType: newImage.eventType,
      eventVersion: newImage.eventVersion,
      aggregateType: newImage.aggregateType,
      aggregateId: newImage.aggregateId,
      tenantId: newImage.tenantId,
      correlationId: newImage.correlationId,
      occurredAt: newImage.occurredAt,
      sequence: newImage.sequence,
      payload: newImage.payload,
    };

    const entry = {
      EventBusName: busName,
      Source: 'hermes', // adjust if needed
      DetailType: newImage.eventType,
      Detail: JSON.stringify(detail),
    };

    const putEventsResponse = await eventBridge.send(new PutEventsCommand({ Entries: [entry] }));

    if (putEventsResponse.FailedEntryCount && putEventsResponse.FailedEntryCount > 0) {
      log('ERROR', 'EventBridge publish failed', { failedCount: putEventsResponse.FailedEntryCount });
      throw new Error(`EventBridge publish failed for ${putEventsResponse.FailedEntryCount} entries`);
    }

    const keys = unmarshall(ddbRecord.dynamodb.Keys as any);

    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: keys.PK, SK: keys.SK },
      UpdateExpression: 'SET outboxStatus = :published, publishedAt = :now',
      ExpressionAttributeValues: {
        ':published': 'PUBLISHED',
        ':now': new Date().toISOString(),
      },
    }));

    log('INFO', 'Successfully published and updated outbox item', {
      eventId: newImage.eventId,
      eventType: newImage.eventType,
      pk: keys.PK,
      sk: keys.SK,
    });
  }
};
