import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SSMClient, ParameterNotFound } from '@aws-sdk/client-ssm';
import { handler } from './handler.js';
import type { EventBridgeEvent } from 'aws-lambda';

describe('webhook-dispatcher handler', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchMock: any;
  let ssmMock: any;
  let consoleLogMock: any;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.ENVIRONMENT = 'dev';
    
    mock.restoreAll();
    
    fetchMock = mock.method(global, 'fetch', async () => ({
      ok: true,
      status: 200,
      text: async () => 'OK',
    }));
    
    ssmMock = mock.method(SSMClient.prototype, 'send', async (cmd: any) => {
      if (cmd.input.Name.endsWith('/webhookUrl')) {
        return { Parameter: { Value: 'https://example.com/webhook' } };
      }
      if (cmd.input.Name.endsWith('/webhookSecret')) {
        return { Parameter: { Value: 'my-secret' } };
      }
      return { Parameter: undefined };
    });

    consoleLogMock = mock.method(console, 'log', () => {});
    
    // Clear the cache in the handler if possible, but since it's a module level cache, 
    // it will persist across tests. We should use unique tenantIds to avoid cache hits.
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createEvent = (tenantId: string): EventBridgeEvent<string, any> => ({
    id: 'evt-123',
    version: '0',
    account: '123456789012',
    time: new Date().toISOString(),
    region: 'us-east-1',
    resources: [],
    source: 'hermes.workflow',
    'detail-type': 'WorkflowExecutionCompleted',
    detail: {
      eventId: 'evt-123',
      eventType: 'WorkflowExecutionCompleted',
      tenantId,
      correlationId: 'corr-123',
      occurredAt: new Date().toISOString(),
      payload: { status: 'success' },
    },
  });

  test('fetches webhookUrl and webhookSecret from SSM', async () => {
    const tenantId = 'tenant-1';
    await handler(createEvent(tenantId));
    
    const ssmCalls = ssmMock.mock.calls;
    assert.equal(ssmCalls.length, 2);
    
    const urlCall = ssmCalls.find((c: any) => c.arguments[0].input.Name === `/hermes/dev/tenants/${tenantId}/webhookUrl`);
    const secretCall = ssmCalls.find((c: any) => c.arguments[0].input.Name === `/hermes/dev/tenants/${tenantId}/webhookSecret`);
    
    assert.ok(urlCall, 'Fetched webhookUrl');
    assert.ok(secretCall, 'Fetched webhookSecret');
  });

  test('skips delivery if webhookUrl parameter is missing in SSM', async () => {
    const tenantId = 'tenant-2';
    ssmMock.mock.restore();
    ssmMock = mock.method(SSMClient.prototype, 'send', async () => ({ Parameter: undefined }));
    
    await handler(createEvent(tenantId));
    
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('skips delivery if ParameterNotFound is thrown for webhookUrl', async () => {
    const tenantId = 'tenant-3';
    ssmMock.mock.restore();
    ssmMock = mock.method(SSMClient.prototype, 'send', async () => {
      throw new ParameterNotFound({ message: 'Not found', $metadata: {} });
    });
    
    await handler(createEvent(tenantId));
    
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('uses default secret if webhookSecret is missing', async () => {
    const tenantId = 'tenant-4';
    ssmMock.mock.restore();
    ssmMock = mock.method(SSMClient.prototype, 'send', async (cmd: any) => {
      if (cmd.input.Name.endsWith('/webhookUrl')) return { Parameter: { Value: 'https://example.com/webhook' } };
      return { Parameter: undefined };
    });
    
    await handler(createEvent(tenantId));
    
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('delivers POST payload with proper structure and User-Agent', async () => {
    const tenantId = 'tenant-5';
    await handler(createEvent(tenantId));
    
    assert.equal(fetchMock.mock.callCount(), 1);
    const fetchArgs = fetchMock.mock.calls[0].arguments;
    assert.equal(fetchArgs[0], 'https://example.com/webhook');
    assert.equal(fetchArgs[1].method, 'POST');
    assert.equal(fetchArgs[1].headers['User-Agent'], 'Hermes-WebhookDispatcher/1.0');
    assert.equal(fetchArgs[1].headers['Content-Type'], 'application/json');
    
    const body = JSON.parse(fetchArgs[1].body);
    assert.equal(body.id, 'evt-123');
    assert.equal(body.tenantId, tenantId);
    assert.deepEqual(body.data, { status: 'success' });
  });

  test('signs payload with HMAC-SHA256 in X-Hermes-Signature header', async () => {
    const tenantId = 'tenant-6';
    await handler(createEvent(tenantId));
    
    assert.equal(fetchMock.mock.callCount(), 1);
    const fetchArgs = fetchMock.mock.calls[0].arguments;
    const signature = fetchArgs[1].headers['X-Hermes-Signature'];
    assert.ok(signature.startsWith('sha256='));
    assert.equal(signature.length, 71); // 'sha256=' (7) + 64 hex chars
  });

  test('retries on 500 error up to 3 attempts and then throws', async () => {
    const tenantId = 'tenant-7';
    fetchMock.mock.restore();
    fetchMock = mock.method(global, 'fetch', async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));
    
    // Replace setTimeout to speed up the test
    const originalSetTimeout = global.setTimeout;
    mock.method(global, 'setTimeout', (cb: any) => { cb(); return {} as any; });
    
    await assert.rejects(
      async () => handler(createEvent(tenantId)),
      /HTTP 500/
    );
    
    assert.equal(fetchMock.mock.callCount(), 3);
    global.setTimeout = originalSetTimeout;
  });

  test('does not retry on 4xx client errors (throws non-retryable)', async () => {
    const tenantId = 'tenant-8';
    fetchMock.mock.restore();
    fetchMock = mock.method(global, 'fetch', async () => ({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    }));
    
    await assert.rejects(
      async () => handler(createEvent(tenantId)),
      /Webhook endpoint returned 400 \(non-retryable\)/
    );
    
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('throws non-retryable immediately on 404', async () => {
    const tenantId = 'tenant-9';
    fetchMock.mock.restore();
    fetchMock = mock.method(global, 'fetch', async () => ({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    }));
    
    await assert.rejects(
      async () => handler(createEvent(tenantId)),
      /Webhook endpoint returned 404 \(non-retryable\)/
    );
    
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('retries on fetch network error (throws) up to 3 times', async () => {
    const tenantId = 'tenant-10';
    fetchMock.mock.restore();
    fetchMock = mock.method(global, 'fetch', async () => {
      throw new Error('Network Error');
    });
    
    const originalSetTimeout = global.setTimeout;
    mock.method(global, 'setTimeout', (cb: any) => { cb(); return {} as any; });
    
    await assert.rejects(
      async () => handler(createEvent(tenantId)),
      /Network Error/
    );
    
    assert.equal(fetchMock.mock.callCount(), 3);
    global.setTimeout = originalSetTimeout;
  });

  test('emits EMF metric on success', async () => {
    const tenantId = 'tenant-11';
    await handler(createEvent(tenantId));
    
    // Find the EMF metric log
    const emfCalls = consoleLogMock.mock.calls.filter((c: any) => {
      try {
        const obj = JSON.parse(c.arguments[0]);
        return obj._aws && obj._aws.CloudWatchMetrics;
      } catch (e) {
        return false;
      }
    });
    
    assert.equal(emfCalls.length, 1);
    const metricObj = JSON.parse(emfCalls[0].arguments[0]);
    assert.equal(metricObj.tenantId, tenantId);
    assert.equal(metricObj.eventType, 'WorkflowExecutionCompleted');
    assert.equal(metricObj.WebhookDelivered, 1);
    assert.equal(metricObj._aws.CloudWatchMetrics[0].Namespace, 'Hermes/Webhooks');
  });

  test('successfully delivers on the second attempt (retries on 503)', async () => {
    const tenantId = 'tenant-12';
    fetchMock.mock.restore();
    
    let attempt = 0;
    fetchMock = mock.method(global, 'fetch', async () => {
      attempt++;
      if (attempt === 1) {
        return { ok: false, status: 503, text: async () => 'Service Unavailable' };
      }
      return { ok: true, status: 200, text: async () => 'OK' };
    });
    
    const originalSetTimeout = global.setTimeout;
    mock.method(global, 'setTimeout', (cb: any) => { cb(); return {} as any; });
    
    await handler(createEvent(tenantId));
    
    assert.equal(fetchMock.mock.callCount(), 2);
    global.setTimeout = originalSetTimeout;
  });
});
