import type { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoEventStore, replayAggregate } from '@hermes/event-store';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const log = (level: string, message: string, fields: Record<string, unknown>) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'snapshot-trigger', message, ...fields }));

export const handler = async (event: DynamoDBStreamEvent) => {
  const tableName = process.env.EVENT_STORE_TABLE;
  const threshold = parseInt(process.env.SNAPSHOT_THRESHOLD || '50', 10);

  if (!tableName) {
    throw new Error('Missing EVENT_STORE_TABLE');
  }

  const store = new DynamoEventStore(tableName, docClient);

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' || !record.dynamodb?.NewImage) {
      continue;
    }

    const newImage = unmarshall(record.dynamodb.NewImage as any);

    if (newImage.itemType !== 'EVENT') {
      continue;
    }

    const sequence = newImage.sequence;
    if (typeof sequence !== 'number' || sequence % threshold !== 0) {
      continue;
    }

    const pk = newImage.PK;
    const aggregateType = newImage.aggregateType;
    const aggregateId = newImage.aggregateId;

    try {
      const events = await store.loadStream(aggregateType, aggregateId);
      
      const applyEvent = (state: any, ev: any) => {
        // Reducer logic: simplistic merge for demonstration purposes,
        // ideally handled by domain logic.
        return { ...state, ...ev.payload };
      };

      const aggregateState = replayAggregate(events, {}, applyEvent);

      await docClient.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: pk,
          SK: `SNAP#${String(sequence).padStart(10, '0')}`,
          aggregateState,
          takenAtSequence: sequence,
          takenAt: new Date().toISOString(),
          schemaVersion: 1,
          itemType: 'SNAPSHOT',
        },
      }));

      log('INFO', 'Snapshot created successfully', {
        aggregateType,
        aggregateId,
        sequence,
        snapshotThreshold: threshold
      });
    } catch (err) {
      log('ERROR', 'Failed to create snapshot', {
        aggregateType,
        aggregateId,
        sequence,
        error: String(err)
      });
      throw err;
    }
  }
};
