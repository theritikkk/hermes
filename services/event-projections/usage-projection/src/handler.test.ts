import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { handler } from './handler';
import { EventTypes } from '@hermes/domain';

describe('usage-projection handler', () => {
  let sendMock: any;
  let consoleLogMock: any;

  beforeEach(() => {
    process.env.EXECUTION_READ_MODEL_TABLE = 'UsageTable';

    sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send');
    sendMock.mock.mockImplementation(() => Promise.resolve({}));

    consoleLogMock = mock.method(console, 'log');
    consoleLogMock.mock.mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restoreAll();
    delete process.env.EXECUTION_READ_MODEL_TABLE;
  });

  const createEvent = (eventType: string, occurredAt: string) => ({
    version: '0',
    id: 'msg-123',
    'detail-type': 'IntegrationEvent',
    source: 'hermes',
    account: '123',
    time: '2023-01-01T00:00:00Z',
    region: 'us-east-1',
    resources: [],
    detail: {
      eventId: 'evt-123',
      eventType,
      aggregateId: 'agg-123',
      tenantId: 't-1',
      correlationId: 'c-1',
      occurredAt,
      payload: {},
    },
  });

  test('throws if EXECUTION_READ_MODEL_TABLE is missing', async () => {
    delete process.env.EXECUTION_READ_MODEL_TABLE;
    await assert.rejects(
      async () => await handler(createEvent(EventTypes.WorkflowExecutionStarted, '2023-01-01T12:00:00Z') as any),
      /Missing EXECUTION_READ_MODEL_TABLE/
    );
  });

  test('ignores irrelevant event types', async () => {
    await handler(createEvent(EventTypes.AssetRegistered, '2023-01-01T12:00:00Z') as any);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  const testCases = [
    { eventType: EventTypes.WorkflowExecutionStarted, expectedField: 'executionsStarted' },
    { eventType: EventTypes.WorkflowExecutionCompleted, expectedField: 'executionsCompleted' },
    { eventType: EventTypes.WorkflowExecutionFailed, expectedField: 'executionsFailed' },
    { eventType: EventTypes.ExecutionCancelled, expectedField: 'executionsCancelled' },
    { eventType: EventTypes.ExecutionTimedOut, expectedField: 'executionsTimedOut' },
    { eventType: EventTypes.ExecutionRetried, expectedField: 'executionsRetried' },
    { eventType: EventTypes.StepCompleted, expectedField: 'stepsCompleted' },
    { eventType: EventTypes.StepFailed, expectedField: 'stepsFailed' },
    { eventType: EventTypes.RetryScheduled, expectedField: 'retriesScheduled' },
    { eventType: EventTypes.SnapshotCreated, expectedField: 'snapshotsCreated' },
    { eventType: EventTypes.WebhookDelivered, expectedField: 'webhooksDelivered' },
    { eventType: EventTypes.NotificationSent, expectedField: 'notificationsSent' },
  ];

  for (const tc of testCases) {
    test(`increments ${tc.expectedField} for ${tc.eventType}`, async () => {
      await handler(createEvent(tc.eventType, '2023-11-15T12:00:00Z') as any);
      
      assert.equal(sendMock.mock.callCount(), 1);
      const call = sendMock.mock.calls[0].arguments[0].input;
      
      assert.equal(call.TableName, 'UsageTable');
      assert.equal(call.Key.PK, 'USAGE#t-1');
      assert.equal(call.Key.SK, 'MONTH#2023-11');
      assert.equal(call.ExpressionAttributeNames['#counter'], tc.expectedField);
      assert.equal(call.ExpressionAttributeValues[':one'], 1);
    });
  }
});
