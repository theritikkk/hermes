import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoEventStore } from '@hermes/event-store';
import { handler } from './handler.js';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';

describe('snapshot-trigger handler', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.EVENT_STORE_TABLE = 'TestTable';
    process.env.SNAPSHOT_THRESHOLD = '50';
    mock.restoreAll();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createEvent = (eventName: 'INSERT' | 'MODIFY' | 'REMOVE', newImage: any): DynamoDBStreamEvent => {
    return {
      Records: [
        {
          eventName,
          dynamodb: {
            NewImage: newImage ? marshall(newImage) as any : undefined,
          },
        },
      ],
    };
  };

  test('throws if EVENT_STORE_TABLE is missing', async () => {
    delete process.env.EVENT_STORE_TABLE;
    await assert.rejects(
      async () => handler(createEvent('INSERT', {})),
      /Missing EVENT_STORE_TABLE/
    );
  });

  test('skips non-INSERT records', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    const loadStreamMock = mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
    
    await handler(createEvent('MODIFY', { itemType: 'EVENT', sequence: 50 }));
    
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(loadStreamMock.mock.callCount(), 0);
  });

  test('skips non-EVENT itemTypes', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    const loadStreamMock = mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
    
    await handler(createEvent('INSERT', { itemType: 'SNAPSHOT', sequence: 50 }));
    
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(loadStreamMock.mock.callCount(), 0);
  });

  test('skips sequences not divisible by threshold', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    const loadStreamMock = mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
    
    await handler(createEvent('INSERT', { itemType: 'EVENT', sequence: 10 }));
    
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(loadStreamMock.mock.callCount(), 0);
  });

  test('skips if sequence is missing', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    const loadStreamMock = mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
    
    await handler(createEvent('INSERT', { itemType: 'EVENT' }));
    
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(loadStreamMock.mock.callCount(), 0);
  });

  test('triggers snapshot on sequence divisible by threshold (seq 50)', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    const loadStreamMock = mock.method(DynamoEventStore.prototype, 'loadStream', async () => [
      { sequence: 1, payload: { a: 1 } },
      { sequence: 2, payload: { b: 2 } },
    ]);
    
    await handler(createEvent('INSERT', { 
      itemType: 'EVENT', 
      sequence: 50,
      PK: 'ORG#1',
      aggregateType: 'Org',
      aggregateId: '1'
    }));
    
    assert.equal(loadStreamMock.mock.callCount(), 1);
    assert.equal(sendMock.mock.callCount(), 1);
  });

  test('loads stream and replays aggregate correctly', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    const loadStreamMock = mock.method(DynamoEventStore.prototype, 'loadStream', async () => [
      { sequence: 1, payload: { status: 'created' } },
      { sequence: 2, payload: { status: 'active', name: 'Test' } },
    ]);
    
    await handler(createEvent('INSERT', { 
      itemType: 'EVENT', 
      sequence: 50,
      PK: 'ORG#1',
      aggregateType: 'Org',
      aggregateId: '1'
    }));
    
    assert.equal(loadStreamMock.mock.callCount(), 1);
    assert.equal(sendMock.mock.callCount(), 1);
    
    const putCommand = sendMock.mock.calls[0].arguments[0] as any;
    assert.deepEqual(putCommand.input.Item.aggregateState, { status: 'active', name: 'Test' });
  });

  test('writes SNAP# item to DynamoDB', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
    
    await handler(createEvent('INSERT', { 
      itemType: 'EVENT', 
      sequence: 100,
      PK: 'ORG#2',
      aggregateType: 'Org',
      aggregateId: '2'
    }));
    
    assert.equal(sendMock.mock.callCount(), 1);
    const putCommand = sendMock.mock.calls[0].arguments[0] as any;
    assert.equal(putCommand.input.TableName, 'TestTable');
    assert.equal(putCommand.input.Item.PK, 'ORG#2');
    assert.equal(putCommand.input.Item.SK, 'SNAP#0000000100');
    assert.equal(putCommand.input.Item.takenAtSequence, 100);
    assert.equal(putCommand.input.Item.schemaVersion, 1);
    assert.equal(putCommand.input.Item.itemType, 'SNAPSHOT');
    assert.ok(putCommand.input.Item.takenAt);
  });

  test('handles loadStream errors by throwing', async () => {
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));
    const loadStreamMock = mock.method(DynamoEventStore.prototype, 'loadStream', async () => {
      throw new Error('Load stream failed');
    });
    
    await assert.rejects(
      async () => handler(createEvent('INSERT', { 
        itemType: 'EVENT', 
        sequence: 50,
        PK: 'ORG#1',
        aggregateType: 'Org',
        aggregateId: '1'
      })),
      /Load stream failed/
    );
    
    assert.equal(loadStreamMock.mock.callCount(), 1);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  test('handles PutCommand errors by throwing', async () => {
    mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
    const sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => {
      throw new Error('Put command failed');
    });
    
    await assert.rejects(
      async () => handler(createEvent('INSERT', { 
        itemType: 'EVENT', 
        sequence: 50,
        PK: 'ORG#1',
        aggregateType: 'Org',
        aggregateId: '1'
      })),
      /Put command failed/
    );
    
    assert.equal(sendMock.mock.callCount(), 1);
  });
});
