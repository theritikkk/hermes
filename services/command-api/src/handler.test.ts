import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DynamoEventStore, EventBridgePublisher } from '@hermes/event-store';

process.env.EVENT_STORE_TABLE = 'test-event-store-table';
process.env.EVENT_BUS_NAME = 'test-event-bus';

import { handler } from './handler';

function createEvent(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = { 'x-role': 'Admin', 'x-tenant-id': 'tenant-test' }
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers,
    requestContext: {
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      requestId: 'req-id',
      routeKey: '$default',
      stage: '$default',
      time: '12/Mar/2020:19:03:58 +0000',
      timeEpoch: 1583348638390,
    },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('Command API Handler', () => {
  beforeEach(() => {
    mock.restoreAll();
    mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
    mock.method(DynamoEventStore.prototype, 'append', async (input: any) => ({
      eventId: 'evt-123',
      eventType: input.eventType,
      eventVersion: 1,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      occurredAt: new Date().toISOString(),
      sequence: 1,
      payload: input.payload,
    }));
    mock.method(EventBridgePublisher.prototype, 'publish', async () => {});
  });

  describe('Routing', () => {
    test('POST /assets returns 202 on valid payload', async () => {
      const event = createEvent('POST', '/assets', {
        s3Key: 'test/file.pdf',
        contentType: 'application/pdf',
        workflowName: 'doc-pipeline',
      });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 202);
      const body = JSON.parse(result.body!);
      assert.equal(body.accepted, true);
      assert.ok(body.executionId);
    });

    test('POST /step-results returns 202 on valid payload', async () => {
      const event = createEvent(
        'POST',
        '/step-results',
        {
          executionId: 'exec-123',
          stepName: 'validate',
          status: 'completed',
          output: { valid: true },
        },
        { 'x-role': 'Service', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 202);
      const body = JSON.parse(result.body!);
      assert.equal(body.accepted, true);
    });

    test('GET /assets returns 404', async () => {
      const event = createEvent('GET', '/assets');
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 404);
    });

    test('POST /unknown returns 404', async () => {
      const event = createEvent('POST', '/unknown');
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 404);
    });
  });

  describe('POST /assets Validation', () => {
    test('missing s3Key returns 400', async () => {
      const event = createEvent('POST', '/assets', {
        contentType: 'application/pdf',
      });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 400);
      const body = JSON.parse(result.body!);
      assert.equal(body.error, 's3Key is required');
    });

    test('missing body defaults to empty object and returns 400', async () => {
      const event = createEvent('POST', '/assets');
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 400);
    });

    test('generates assetId if not provided', async () => {
      const event = createEvent('POST', '/assets', { s3Key: 'file.txt' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 202);
      const body = JSON.parse(result.body!);
      assert.ok(body.aggregateId);
    });

    test('uses provided assetId if given', async () => {
      const event = createEvent('POST', '/assets', {
        assetId: 'custom-asset-id',
        s3Key: 'file.txt',
      });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 202);
      const body = JSON.parse(result.body!);
      assert.equal(body.aggregateId, 'custom-asset-id');
    });
  });

  describe('POST /step-results Validation', () => {
    test('missing executionId returns 400', async () => {
      const event = createEvent(
        'POST',
        '/step-results',
        { stepName: 'validate' },
        { 'x-role': 'Service', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 400);
      const body = JSON.parse(result.body!);
      assert.equal(body.error, 'executionId and stepName are required');
    });

    test('missing stepName returns 400', async () => {
      const event = createEvent(
        'POST',
        '/step-results',
        { executionId: 'exec-123' },
        { 'x-role': 'Service', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 400);
      const body = JSON.parse(result.body!);
      assert.equal(body.error, 'executionId and stepName are required');
    });
  });

  describe('Auth & RBAC', () => {
    test('POST /assets with User role is allowed', async () => {
      const event = createEvent(
        'POST',
        '/assets',
        { s3Key: 'file.txt' },
        { 'x-role': 'User', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 202);
    });

    test('POST /assets without User/Admin role returns 403', async () => {
      const event = createEvent(
        'POST',
        '/assets',
        { s3Key: 'file.txt' },
        { 'x-role': 'Service', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 403);
      const body = JSON.parse(result.body!);
      assert.match(body.error, /RBACError/);
    });

    test('POST /step-results with Service role is allowed', async () => {
      const event = createEvent(
        'POST',
        '/step-results',
        { executionId: 'exec-1', stepName: 'ocr' },
        { 'x-role': 'Service', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 202);
    });

    test('POST /step-results with User role returns 403', async () => {
      const event = createEvent(
        'POST',
        '/step-results',
        { executionId: 'exec-1', stepName: 'ocr' },
        { 'x-role': 'User', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 403);
    });

    test('Admin role bypasses RBAC checks for all routes', async () => {
      const assetRes = (await handler(
        createEvent(
          'POST',
          '/assets',
          { s3Key: 'file.txt' },
          { 'x-role': 'Admin', 'x-tenant-id': 'tenant-test' }
        )
      )) as { statusCode: number; body?: string };
      assert.equal(assetRes.statusCode, 202);

      const stepRes = (await handler(
        createEvent(
          'POST',
          '/step-results',
          { executionId: 'exec-1', stepName: 'ocr' },
          { 'x-role': 'Admin', 'x-tenant-id': 'tenant-test' }
        )
      )) as { statusCode: number; body?: string };
      assert.equal(stepRes.statusCode, 202);
    });
  });

  describe('Tenant Isolation', () => {
    test('non-admin requesting different tenant returns 403', async () => {
      const event = createEvent(
        'POST',
        '/assets',
        { s3Key: 'file.txt', tenantId: 'tenant-other' },
        { 'x-role': 'User', 'x-tenant-id': 'tenant-caller' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 403);
      const body = JSON.parse(result.body!);
      assert.match(body.error, /TenantIsolationError/);
    });

    test('admin requesting different tenant is allowed', async () => {
      const event = createEvent(
        'POST',
        '/assets',
        { s3Key: 'file.txt', tenantId: 'tenant-other' },
        { 'x-role': 'Admin', 'x-tenant-id': 'tenant-caller' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 202);
    });
  });

  describe('Error Handling', () => {
    test('event store failure returns 500', async () => {
      mock.restoreAll();
      mock.method(DynamoEventStore.prototype, 'loadStream', async () => []);
      mock.method(DynamoEventStore.prototype, 'append', async () => {
        throw new Error('DynamoDB Connection Failure');
      });

      const event = createEvent('POST', '/assets', { s3Key: 'file.txt' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 500);
      const body = JSON.parse(result.body!);
      assert.equal(body.error, 'internal error');
    });
  });
});
