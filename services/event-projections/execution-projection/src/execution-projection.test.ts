import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { handler } from './handler';
import { EventTypes } from '@hermes/domain';

describe('execution-projection handler', () => {
  let sendMock: any;
  let consoleLogMock: any;

  beforeEach(() => {
    process.env.EXECUTION_READ_MODEL_TABLE = 'ExecTable';
    process.env.WORKFLOW_READ_MODEL_TABLE = 'WfTable';
    process.env.ASSET_READ_MODEL_TABLE = 'AssetTable';
    process.env.TENANT_READ_MODEL_TABLE = 'TenantTable';
    process.env.METRICS_READ_MODEL_TABLE = 'MetricsTable';
    process.env.AUDIT_READ_MODEL_TABLE = 'AuditTable';

    sendMock = mock.method(DynamoDBDocumentClient.prototype, 'send');
    sendMock.mock.mockImplementation(() => Promise.resolve({}));

    consoleLogMock = mock.method(console, 'log');
    consoleLogMock.mock.mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restoreAll();
    delete process.env.EXECUTION_READ_MODEL_TABLE;
    delete process.env.WORKFLOW_READ_MODEL_TABLE;
    delete process.env.ASSET_READ_MODEL_TABLE;
    delete process.env.TENANT_READ_MODEL_TABLE;
    delete process.env.METRICS_READ_MODEL_TABLE;
    delete process.env.AUDIT_READ_MODEL_TABLE;
  });

  const createEvent = (eventType: string, payload: any = {}) => ({
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
      occurredAt: '2023-01-01T00:00:00.000Z',
      payload,
    },
  });

  test('audit and tenant projections updated for any event', async () => {
    await handler(createEvent('SomeUnknownEvent') as any);
    
    assert.equal(sendMock.mock.callCount(), 2);
    const auditCall = sendMock.mock.calls[0].arguments[0].input;
    assert.equal(auditCall.TableName, 'AuditTable');
    assert.equal(auditCall.Item.PK, 'TENANT#t-1');
    assert.equal(auditCall.Item.SK, 'AUDIT#2023-01-01T00:00:00.000Z#evt-123');

    const tenantCall = sendMock.mock.calls[1].arguments[0].input;
    assert.equal(tenantCall.TableName, 'TenantTable');
    assert.equal(tenantCall.Key.PK, 'TENANT#t-1');
  });

  test('skips unknown event types gracefully', async () => {
    await handler(createEvent('RandomEvent') as any);
    assert.equal(sendMock.mock.callCount(), 2);
  });

  test('AssetRegistered', async () => {
    await handler(createEvent(EventTypes.AssetRegistered, {
      assetId: 'a-1', s3Key: 'key', contentType: 'json', workflowName: 'wf1', workflowVersion: 1
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.TableName, 'AssetTable');
    assert.equal(call.Item.PK, 'TENANT#t-1');
    assert.equal(call.Item.SK, 'ASSET#a-1');
  });

  test('WorkflowExecutionStarted', async () => {
    await handler(createEvent(EventTypes.WorkflowExecutionStarted, {
      workflowName: 'wf1', workflowVersion: 1, assetId: 'a-1', s3Key: 'key'
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 4);
    const execCall = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(execCall.TableName, 'ExecTable');
    assert.equal(execCall.Key.SK, 'EXEC#c-1');
    assert.equal(execCall.ExpressionAttributeValues[':running'], 'RUNNING');

    const wfCall = sendMock.mock.calls[3].arguments[0].input;
    assert.equal(wfCall.TableName, 'WfTable');
    assert.equal(wfCall.Item.SK, 'WF#wf1#EXEC#c-1');
  });

  test('StepCompleted', async () => {
    await handler(createEvent(EventTypes.StepCompleted, {
      stepName: 'step1', output: { out: 1 }
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.TableName, 'ExecTable');
    assert.equal(call.UpdateExpression, 'SET steps.#stepName = :stepState, updatedAt = :now, lastEventId = :eventId');
    assert.deepEqual(call.ExpressionAttributeValues[':stepState'], {
      status: 'completed', output: { out: 1 }, completedAt: '2023-01-01T00:00:00.000Z'
    });
  });

  test('StepFailed', async () => {
    await handler(createEvent(EventTypes.StepFailed, {
      stepName: 'step1', error: 'boom'
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.TableName, 'ExecTable');
    assert.deepEqual(call.ExpressionAttributeValues[':stepState'].status, 'failed');
  });

  test('WorkflowExecutionCompleted', async () => {
    await handler(createEvent(EventTypes.WorkflowExecutionCompleted, {
      workflowName: 'wf1', output: { result: 'ok' }
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 5);
    const execCall = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(execCall.TableName, 'ExecTable');
    assert.equal(execCall.ExpressionAttributeValues[':completed'], 'COMPLETED');

    const wfCall = sendMock.mock.calls[3].arguments[0].input;
    assert.equal(wfCall.TableName, 'WfTable');
    
    const metricsCall = sendMock.mock.calls[4].arguments[0].input;
    assert.equal(metricsCall.TableName, 'MetricsTable');
    assert.equal(metricsCall.UpdateExpression, 'ADD completedExecutions :one SET tenantId = :tId, date = :d');
  });

  test('WorkflowExecutionFailed', async () => {
    await handler(createEvent(EventTypes.WorkflowExecutionFailed, {
      workflowName: 'wf1', reason: 'bad'
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 5);
    const execCall = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(execCall.ExpressionAttributeValues[':failed'], 'FAILED');
    
    const wfCall = sendMock.mock.calls[3].arguments[0].input;
    assert.equal(wfCall.ExpressionAttributeValues[':failed'], 'FAILED');

    const metricsCall = sendMock.mock.calls[4].arguments[0].input;
    assert.equal(metricsCall.UpdateExpression, 'ADD failedExecutions :one SET tenantId = :tId, date = :d');
  });

  test('RetryScheduled', async () => {
    await handler(createEvent(EventTypes.RetryScheduled, {
      stepName: 'step1', attemptNumber: 2, nextAttemptAt: '2023-01-01T01:00:00.000Z', error: 'err'
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.ExpressionAttributeValues[':stepState'].status, 'retry_scheduled');
  });

  test('SnapshotCreated', async () => {
    await handler(createEvent(EventTypes.SnapshotCreated, {
      sequence: 123
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.ExpressionAttributeValues[':seq'], 123);
  });

  test('WebhookDelivered', async () => {
    await handler(createEvent(EventTypes.WebhookDelivered, {
      httpStatus: 200
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.ExpressionAttributeValues[':delivered'], true);
  });

  test('NotificationSent', async () => {
    await handler(createEvent(EventTypes.NotificationSent, {
      channel: 'email'
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.ExpressionAttributeValues[':sent'], true);
  });

  test('ExecutionCancelled', async () => {
    await handler(createEvent(EventTypes.ExecutionCancelled, {
      reason: 'user request', cancelledBy: 'admin'
    }) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.ExpressionAttributeValues[':cancelled'], 'CANCELLED');
  });

  test('ExecutionTimedOut', async () => {
    await handler(createEvent(EventTypes.ExecutionTimedOut, {}) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.ExpressionAttributeValues[':timedOut'], 'TIMED_OUT');
  });

  test('ExecutionRetried', async () => {
    await handler(createEvent(EventTypes.ExecutionRetried, {}) as any);
    
    assert.equal(sendMock.mock.callCount(), 3);
    const call = sendMock.mock.calls[2].arguments[0].input;
    assert.equal(call.ExpressionAttributeValues[':running'], 'RUNNING');
    assert.equal(call.ExpressionAttributeValues[':one'], 1);
  });

  test('handles ConditionalCheckFailedException gracefully', async () => {
    sendMock.mock.mockImplementationOnce(() => Promise.resolve({})); // audit
    sendMock.mock.mockImplementationOnce(() => Promise.resolve({})); // tenant
    
    const err = new ConditionalCheckFailedException({ message: 'condition failed', $metadata: {} });
    sendMock.mock.mockImplementationOnce(() => Promise.reject(err)); // domain projection

    await handler(createEvent(EventTypes.WorkflowExecutionStarted, {}) as any);
    
    assert.ok(consoleLogMock.mock.callCount() > 0);
    const logged = JSON.parse(consoleLogMock.mock.calls[consoleLogMock.mock.callCount() - 1].arguments[0]);
    assert.equal(logged.level, 'WARN');
  });

  test('throws other exceptions', async () => {
    sendMock.mock.mockImplementationOnce(() => Promise.reject(new Error('Unknown Error')));
    
    await assert.rejects(
      async () => await handler(createEvent(EventTypes.AssetRegistered, {}) as any),
      /Unknown Error/
    );
  });

});
