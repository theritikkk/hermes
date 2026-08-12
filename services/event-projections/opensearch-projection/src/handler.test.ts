import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from './handler';
import { EventTypes } from '@hermes/domain';

describe('opensearch-projection handler', () => {
  let fetchMock: any;
  let consoleLogMock: any;

  beforeEach(() => {
    process.env.OPENSEARCH_ENDPOINT = 'search-hermes.us-east-1.es.amazonaws.com';

    fetchMock = mock.method(global, 'fetch');
    fetchMock.mock.mockImplementation(() => Promise.resolve({
      ok: true,
      json: async () => ({ errors: false })
    }));

    consoleLogMock = mock.method(console, 'log');
    consoleLogMock.mock.mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restoreAll();
    delete process.env.OPENSEARCH_ENDPOINT;
  });

  const createEvent = (eventType: string, occurredAt: string, payload: any = {}) => ({
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
      payload,
    },
  });

  test('skips if OPENSEARCH_ENDPOINT is not set', async () => {
    delete process.env.OPENSEARCH_ENDPOINT;
    await handler(createEvent(EventTypes.WorkflowExecutionStarted, '2023-01-01T12:00:00Z') as any);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('skips if event type is not relevant', async () => {
    await handler(createEvent('UnknownEvent', '2023-01-01T12:00:00Z') as any);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('indexes document for execution events with correct suffix and NDJSON', async () => {
    await handler(createEvent(EventTypes.WorkflowExecutionStarted, '2023-11-15T12:00:00Z', { workflowName: 'wf1' }) as any);
    
    assert.equal(fetchMock.mock.callCount(), 1);
    const url = fetchMock.mock.calls[0].arguments[0];
    const options = fetchMock.mock.calls[0].arguments[1];
    
    assert.equal(url, 'https://search-hermes.us-east-1.es.amazonaws.com/_bulk');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/x-ndjson');
    
    const bodyLines = options.body.split('\n');
    assert.equal(bodyLines.length, 3); // meta, body, empty line
    
    const meta = JSON.parse(bodyLines[0]);
    assert.equal(meta.index._index, 'hermes-executions-2023.11');
    assert.equal(meta.index._id, 'c-1');

    const doc = JSON.parse(bodyLines[1]);
    assert.equal(doc.executionId, 'c-1');
    assert.equal(doc.tenantId, 't-1');
    assert.equal(doc.workflowName, 'wf1');
  });

  test('formats nested step output correctly for StepCompleted', async () => {
    await handler(createEvent(EventTypes.StepCompleted, '2023-11-15T12:00:00Z', { stepName: 'step1', output: { val: 42 } }) as any);
    
    const bodyLines = fetchMock.mock.calls[0].arguments[1].body.split('\n');
    const doc = JSON.parse(bodyLines[1]);
    
    assert.ok(doc.step_step1);
    assert.equal(doc.step_step1.status, 'completed');
    assert.equal(doc.step_step1.val, 42);
  });

  test('formats nested step output correctly for StepFailed', async () => {
    await handler(createEvent(EventTypes.StepFailed, '2023-11-15T12:00:00Z', { stepName: 'step1', error: 'boom' }) as any);
    
    const bodyLines = fetchMock.mock.calls[0].arguments[1].body.split('\n');
    const doc = JSON.parse(bodyLines[1]);
    
    assert.ok(doc.step_step1);
    assert.equal(doc.step_step1.status, 'failed');
    assert.equal(doc.step_step1.error, 'boom');
  });

  test('handles bulk index HTTP error', async () => {
    fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
      ok: false,
      status: 400,
      text: async () => 'Bad Request'
    }));

    await assert.rejects(
      async () => await handler(createEvent(EventTypes.WorkflowExecutionStarted, '2023-11-15T12:00:00Z') as any),
      /OpenSearch bulk failed: HTTP 400  Bad Request/
    );
  });

  test('handles bulk index JSON response errors', async () => {
    fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: async () => ({ errors: true, items: [{ index: { error: 'some error' } }] })
    }));

    await assert.rejects(
      async () => await handler(createEvent(EventTypes.WorkflowExecutionStarted, '2023-11-15T12:00:00Z') as any),
      /OpenSearch bulk had errors:/
    );
  });
});
