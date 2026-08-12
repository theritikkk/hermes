import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

process.env.EXECUTION_READ_MODEL_TABLE = 'execution-table';
process.env.ASSET_READ_MODEL_TABLE = 'asset-table';
process.env.WORKFLOW_READ_MODEL_TABLE = 'workflow-table';
process.env.METRICS_READ_MODEL_TABLE = 'metrics-table';
process.env.AUDIT_READ_MODEL_TABLE = 'audit-table';
process.env.TENANT_READ_MODEL_TABLE = 'tenant-table';

import { handler } from './handler';

function createEvent(
  method: string,
  path: string,
  pathParameters?: Record<string, string>,
  headers: Record<string, string> = { 'x-role': 'Admin', 'x-tenant-id': 'tenant-test' }
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers,
    pathParameters,
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
    isBase64Encoded: false,
  };
}

describe('Query API Handler', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  describe('GET /executions/{executionId}', () => {
    test('returns 200 with item when found', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Item: { PK: 'TENANT#tenant-test', SK: 'EXEC#exec-123', status: 'RUNNING' },
      }));

      const event = createEvent('GET', '/executions/exec-123', { executionId: 'exec-123' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
      const body = JSON.parse(result.body!);
      assert.equal(body.status, 'RUNNING');
    });

    test('returns 404 when execution not found', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Item: undefined,
      }));

      const event = createEvent('GET', '/executions/exec-999', { executionId: 'exec-999' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 404);
      const body = JSON.parse(result.body!);
      assert.equal(body.error, 'execution not found');
    });

    test('returns 400 when executionId path parameter is missing', async () => {
      const event = createEvent('GET', '/executions/');
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 400);
      const body = JSON.parse(result.body!);
      assert.equal(body.error, 'executionId required');
    });
  });

  describe('GET /assets/{assetId}', () => {
    test('returns 200 with asset when found', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Item: { PK: 'TENANT#tenant-test', SK: 'ASSET#asset-123', s3Key: 'file.pdf' },
      }));

      const event = createEvent('GET', '/assets/asset-123', { assetId: 'asset-123' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
      const body = JSON.parse(result.body!);
      assert.equal(body.s3Key, 'file.pdf');
    });

    test('returns 404 when asset not found', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Item: undefined,
      }));

      const event = createEvent('GET', '/assets/asset-999', { assetId: 'asset-999' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 404);
    });
  });

  describe('GET /workflows/{workflowName}', () => {
    test('returns 200 with workflow executions list', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Items: [
          { SK: 'WF#doc-pipeline#EXEC#exec-1', status: 'COMPLETED' },
          { SK: 'WF#doc-pipeline#EXEC#exec-2', status: 'RUNNING' },
        ],
        Count: 2,
      }));

      const event = createEvent('GET', '/workflows/doc-pipeline', { workflowName: 'doc-pipeline' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
      const body = JSON.parse(result.body!);
      assert.equal(body.workflowName, 'doc-pipeline');
      assert.equal(body.executions.length, 2);
    });
  });

  describe('GET /tenants/{tenantId}/metrics', () => {
    test('returns 200 with metrics items', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Items: [{ date: '2026-08-12', completedExecutions: 42 }],
      }));

      const event = createEvent('GET', '/tenants/tenant-test/metrics', { tenantId: 'tenant-test' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
      const body = JSON.parse(result.body!);
      assert.equal(body.tenantId, 'tenant-test');
      assert.equal(body.metrics.length, 1);
    });
  });

  describe('GET /tenants/{tenantId}/audit', () => {
    test('returns 200 with audit events when requested by Admin', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Items: [{ eventType: 'WorkflowExecutionStarted', occurredAt: '2026-08-12T00:00:00Z' }],
      }));

      const event = createEvent(
        'GET',
        '/tenants/tenant-test/audit',
        { tenantId: 'tenant-test' },
        { 'x-role': 'Admin', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
      const body = JSON.parse(result.body!);
      assert.equal(body.auditLog.length, 1);
    });

    test('returns 403 when audit requested by non-Admin', async () => {
      const event = createEvent(
        'GET',
        '/tenants/tenant-test/audit',
        { tenantId: 'tenant-test' },
        { 'x-role': 'User', 'x-tenant-id': 'tenant-test' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 403);
      const body = JSON.parse(result.body!);
      assert.match(body.error, /RBACError/);
    });
  });

  describe('GET /tenants/{tenantId}', () => {
    test('returns 200 with tenant profile when found', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Item: { PK: 'TENANT#tenant-test', SK: 'PROFILE', totalEventsProcessed: 100 },
      }));

      const event = createEvent('GET', '/tenants/tenant-test', { tenantId: 'tenant-test' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
      const body = JSON.parse(result.body!);
      assert.equal(body.totalEventsProcessed, 100);
    });

    test('returns 200 with default active profile when item not yet recorded', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Item: undefined,
      }));

      const event = createEvent('GET', '/tenants/tenant-test', { tenantId: 'tenant-test' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
      const body = JSON.parse(result.body!);
      assert.equal(body.status, 'ACTIVE');
    });
  });

  describe('Auth & Tenant Isolation', () => {
    test('returns 403 when non-admin requests cross-tenant data', async () => {
      const event = createEvent(
        'GET',
        '/executions/exec-1',
        { executionId: 'exec-1', tenantId: 'tenant-other' },
        { 'x-role': 'User', 'x-tenant-id': 'tenant-caller' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 403);
      const body = JSON.parse(result.body!);
      assert.match(body.error, /TenantIsolationError/);
    });

    test('admin is allowed to query across tenants', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => ({
        Item: { PK: 'TENANT#tenant-other', SK: 'EXEC#exec-1' },
      }));

      const event = createEvent(
        'GET',
        '/executions/exec-1',
        { executionId: 'exec-1', tenantId: 'tenant-other' },
        { 'x-role': 'Admin', 'x-tenant-id': 'tenant-caller' }
      );
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 200);
    });
  });

  describe('Error Handling', () => {
    test('returns 500 when DynamoDB throws error', async () => {
      mock.method(DynamoDBDocumentClient.prototype, 'send', async () => {
        throw new Error('DynamoDB Service Exception');
      });

      const event = createEvent('GET', '/executions/exec-123', { executionId: 'exec-123' });
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 500);
      const body = JSON.parse(result.body!);
      assert.equal(body.error, 'internal error');
    });

    test('returns 404 for unknown routes', async () => {
      const event = createEvent('GET', '/non-existent-route');
      const result = (await handler(event)) as { statusCode: number; body?: string };
      assert.equal(result.statusCode, 404);
    });
  });
});
