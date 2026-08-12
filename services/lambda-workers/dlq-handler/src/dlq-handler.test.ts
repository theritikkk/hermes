import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from './handler.js';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('dlq-handler', () => {
  let mockSend: any;
  let originalEnv: NodeJS.ProcessEnv;
  let originalConsoleLog: any;
  let logs: any[];

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.EVENT_STORE_TABLE = 'TestStore';
    process.env.DLQ_NAME = 'TestDLQ';
    process.env.POISON_THRESHOLD = '5';

    mockSend = mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({}));

    originalConsoleLog = console.log;
    logs = [];
    console.log = (...args: any[]) => {
      logs.push(args);
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restoreAll();
    console.log = originalConsoleLog;
  });

  const createEvent = (records: any[]) => ({
    Records: records
  } as any);

  test('processes a record with receiveCount >= 5 as POISON', async () => {
    const event = createEvent([{
      messageId: 'msg-1',
      body: JSON.stringify({ tenantId: 't1' }),
      attributes: { ApproximateReceiveCount: '5' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.classification, 'POISON');
    assert.equal(callArgs.Item.tenantId, 't1');
  });

  test('processes a record with receiveCount 1-4 as TRANSIENT', async () => {
    const event = createEvent([{
      messageId: 'msg-2',
      body: JSON.stringify({ tenantId: 't2' }),
      attributes: { ApproximateReceiveCount: '3' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.classification, 'TRANSIENT');
  });

  test('processes a record with receiveCount 0 as UNKNOWN', async () => {
    const event = createEvent([{
      messageId: 'msg-3',
      body: JSON.stringify({ tenantId: 't3' }),
      attributes: { ApproximateReceiveCount: '0' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.classification, 'UNKNOWN');
  });

  test('processes a record with no receiveCount as UNKNOWN', async () => {
    const event = createEvent([{
      messageId: 'msg-4',
      body: JSON.stringify({ tenantId: 't4' })
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.classification, 'UNKNOWN');
  });

  test('parses message with valid JSON outer/inner', async () => {
    const original = JSON.stringify({ tenantId: 't-inner', eventId: 'e-1', eventType: 'TEST' });
    const event = createEvent([{
      messageId: 'msg-5',
      body: JSON.stringify({ originalMessage: original, errorContext: 'err' }),
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.tenantId, 't-inner');
    assert.equal(callArgs.Item.eventId, 'e-1');
    assert.equal(callArgs.Item.eventType, 'TEST');
    assert.equal(callArgs.Item.errorContext, 'err');
    assert.deepEqual(callArgs.Item.originalBody, { tenantId: 't-inner', eventId: 'e-1', eventType: 'TEST' });
  });

  test('parses message with object originalMessage', async () => {
    const event = createEvent([{
      messageId: 'msg-5b',
      body: JSON.stringify({ originalMessage: { tenantId: 't-obj' } }),
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.tenantId, 't-obj');
  });

  test('parses message with malformed JSON fallback', async () => {
    const event = createEvent([{
      messageId: 'msg-6',
      body: 'Not a JSON',
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.tenantId, 'unknown');
    assert.equal(callArgs.Item.originalBody, 'Not a JSON');
  });

  test('constructs DLQ item with correct PK and SK', async () => {
    const event = createEvent([{
      messageId: 'msg-pk-sk',
      body: JSON.stringify({}),
      eventSourceARN: 'arn:aws:sqs:us-east-1:123:MyQueue',
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.PK, 'DLQ#MyQueue');
    assert.equal(callArgs.Item.SK, 'MSG#msg-pk-sk');
    assert.equal(callArgs.Item.queueName, 'MyQueue');
  });

  test('uses DLQ_NAME from env if ARN is missing', async () => {
    const event = createEvent([{
      messageId: 'msg-arn-miss',
      body: JSON.stringify({}),
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    await handler(event);

    const callArgs = mockSend.mock.calls[0].arguments[0].input;
    assert.equal(callArgs.Item.PK, 'DLQ#TestDLQ');
  });

  test('handles ConditionalCheckFailedException gracefully', async () => {
    const err = new Error('ConditionalCheckFailedException') as any;
    err.name = 'ConditionalCheckFailedException';
    mockSend.mock.mockImplementation(async () => { throw err; });

    const event = createEvent([{
      messageId: 'msg-cond',
      body: JSON.stringify({}),
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    // Should not throw
    await handler(event);
    assert.equal(mockSend.mock.calls.length, 1);
  });

  test('logs error for other exceptions during save', async () => {
    const err = new Error('Other error');
    mockSend.mock.mockImplementation(async () => { throw err; });

    const event = createEvent([{
      messageId: 'msg-err',
      body: JSON.stringify({}),
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    // Should not throw
    await handler(event);
    assert.equal(mockSend.mock.calls.length, 1);
  });

  test('emits EMF metrics', async () => {
    const event = createEvent([{
      messageId: 'msg-emf',
      body: JSON.stringify({ tenantId: 't-emf' }),
      attributes: { ApproximateReceiveCount: '2' }
    }]);

    await handler(event);

    const emfLog = logs.find(logArgs => {
      if (typeof logArgs[0] === 'string' && logArgs[0].includes('_aws')) return true;
      return false;
    });

    assert.ok(emfLog, 'EMF metric not found');
    const parsed = JSON.parse(emfLog[0]);
    assert.equal(parsed.classification, 'TRANSIENT');
    assert.equal(parsed.DLQMessageCount, 1);
  });

  test('skips persistence if EVENT_STORE_TABLE is missing', async () => {
    delete process.env.EVENT_STORE_TABLE;
    const event = createEvent([{
      messageId: 'msg-no-table',
      body: JSON.stringify({}),
      attributes: { ApproximateReceiveCount: '1' }
    }]);

    await handler(event);

    assert.equal(mockSend.mock.calls.length, 0);
  });

  test('processes multiple records in an event', async () => {
    const event = createEvent([
      { messageId: 'm1', body: JSON.stringify({ tenantId: 't1' }), attributes: { ApproximateReceiveCount: '1' } },
      { messageId: 'm2', body: JSON.stringify({ tenantId: 't2' }), attributes: { ApproximateReceiveCount: '5' } }
    ]);

    await handler(event);

    assert.equal(mockSend.mock.calls.length, 2);
    assert.equal(mockSend.mock.calls[0].arguments[0].input.Item.classification, 'TRANSIENT');
    assert.equal(mockSend.mock.calls[1].arguments[0].input.Item.classification, 'POISON');
  });

});
