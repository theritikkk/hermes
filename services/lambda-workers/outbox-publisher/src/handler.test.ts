import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from './handler.js';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';

describe('outbox-publisher handler', () => {
  let mockDbSend: any;
  let mockEbSend: any;
  let originalEnv: NodeJS.ProcessEnv;
  let originalConsoleLog: any;
  let logs: any[];

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.EVENT_BUS_NAME = 'TestBus';
    process.env.EVENT_STORE_TABLE = 'TestStore';

    mockDbSend = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    mockEbSend = mock.method(EventBridgeClient.prototype, 'send', async () => ({ FailedEntryCount: 0 }));

    originalConsoleLog = console.log;
    logs = [];
    console.log = (...args: any[]) => logs.push(args);
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restoreAll();
    console.log = originalConsoleLog;
  });

  const createEvent = (records: any[]) => ({ Records: records } as any);

  test('throws if EVENT_BUS_NAME missing', async () => {
    delete process.env.EVENT_BUS_NAME;
    await assert.rejects(handler(createEvent([])), /Missing EVENT_BUS_NAME or EVENT_STORE_TABLE/);
  });

  test('throws if EVENT_STORE_TABLE missing', async () => {
    delete process.env.EVENT_STORE_TABLE;
    await assert.rejects(handler(createEvent([])), /Missing EVENT_BUS_NAME or EVENT_STORE_TABLE/);
  });

  test('handles malformed SQS body gracefully', async () => {
    const event = createEvent([{ body: 'not-json' }]);
    await handler(event);
    assert.equal(mockEbSend.mock.calls.length, 0);
  });

  test('skips records without NewImage', async () => {
    const event = createEvent([{ body: JSON.stringify({ dynamodb: {} }) }]);
    await handler(event);
    assert.equal(mockEbSend.mock.calls.length, 0);
  });

  test('skips records where outboxStatus != PENDING', async () => {
    const event = createEvent([{
      body: JSON.stringify({
        dynamodb: {
          NewImage: { outboxStatus: { S: 'PUBLISHED' } }
        }
      })
    }]);
    await handler(event);
    assert.equal(mockEbSend.mock.calls.length, 0);
  });

  test('publishes Detail to EventBridge', async () => {
    const event = createEvent([{
      body: JSON.stringify({
        dynamodb: {
          NewImage: {
            outboxStatus: { S: 'PENDING' },
            eventId: { S: 'e1' },
            eventType: { S: 't1' },
            tenantId: { S: 'tenant1' },
            payload: { S: 'data' }
          },
          Keys: {
            PK: { S: 'pk1' },
            SK: { S: 'sk1' }
          }
        }
      })
    }]);

    await handler(event);
    
    assert.equal(mockEbSend.mock.calls.length, 1);
    const ebCall = mockEbSend.mock.calls[0].arguments[0].input;
    assert.equal(ebCall.Entries[0].EventBusName, 'TestBus');
    assert.equal(ebCall.Entries[0].DetailType, 't1');
    const detail = JSON.parse(ebCall.Entries[0].Detail);
    assert.equal(detail.eventId, 'e1');
    assert.equal(detail.tenantId, 'tenant1');
    assert.equal(detail.payload, 'data');
  });

  test('updates outboxStatus to PUBLISHED', async () => {
    const event = createEvent([{
      body: JSON.stringify({
        dynamodb: {
          NewImage: { outboxStatus: { S: 'PENDING' }, eventId: { S: 'e1' } },
          Keys: { PK: { S: 'pk1' }, SK: { S: 'sk1' } }
        }
      })
    }]);

    await handler(event);
    
    assert.equal(mockDbSend.mock.calls.length, 1);
    const dbCall = mockDbSend.mock.calls[0].arguments[0].input;
    assert.equal(dbCall.TableName, 'TestStore');
    assert.deepEqual(dbCall.Key, { PK: 'pk1', SK: 'sk1' });
    assert.equal(dbCall.UpdateExpression, 'SET outboxStatus = :published, publishedAt = :now');
    assert.equal(dbCall.ExpressionAttributeValues[':published'], 'PUBLISHED');
  });

  test('throws if EventBridge publish has FailedEntryCount > 0', async () => {
    mockEbSend.mock.mockImplementation(async () => ({ FailedEntryCount: 1 }));
    const event = createEvent([{
      body: JSON.stringify({
        dynamodb: {
          NewImage: { outboxStatus: { S: 'PENDING' } },
          Keys: { PK: { S: 'pk1' }, SK: { S: 'sk1' } }
        }
      })
    }]);

    await assert.rejects(handler(event), /EventBridge publish failed/);
    assert.equal(mockDbSend.mock.calls.length, 0); // shouldn't update db if EB failed
  });

  test('processes multiple valid records', async () => {
    const event = createEvent([
      { body: JSON.stringify({ dynamodb: { NewImage: { outboxStatus: { S: 'PENDING' } }, Keys: { PK: { S: 'pk1' } } } }) },
      { body: JSON.stringify({ dynamodb: { NewImage: { outboxStatus: { S: 'PENDING' } }, Keys: { PK: { S: 'pk2' } } } }) }
    ]);

    await handler(event);
    assert.equal(mockEbSend.mock.calls.length, 2);
    assert.equal(mockDbSend.mock.calls.length, 2);
  });
});
