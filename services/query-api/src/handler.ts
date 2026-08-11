import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  extractAuthContext,
  enforceTenantIsolation,
  enforceRBAC,
  TenantIsolationError,
  RBACError,
} from '@hermes/domain';
import { createLogger } from '@hermes/observability';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = extractAuthContext(event);
  const log = createLogger({ service: 'query-api', tenantId: auth.tenantId, userId: auth.userId });
  const path = event.rawPath;

  try {
    // Enforce base read access (User, Admin, or Service role required)
    enforceRBAC(auth, 'User');

    // Extract requested tenantId if present in path, and enforce strict tenant isolation
    const requestedTenantId = event.pathParameters?.tenantId;
    const effectiveTenantId = enforceTenantIsolation(auth, requestedTenantId);

    log.info('processing query request', { path, roles: auth.roles, effectiveTenantId });

    // -----------------------------------------------------------------
    // 1. GET /executions/{executionId}
    // -----------------------------------------------------------------
    if (path.startsWith('/executions/')) {
      const executionId = event.pathParameters?.executionId;
      if (!executionId) return json(400, { error: 'executionId required' });

      const result = await doc.send(new GetCommand({
        TableName: process.env.EXECUTION_READ_MODEL_TABLE!,
        Key: {
          PK: `TENANT#${effectiveTenantId}`,
          SK: `EXEC#${executionId}`,
        },
      }));

      if (!result.Item) return json(404, { error: 'execution not found' });
      return json(200, result.Item);
    }

    // -----------------------------------------------------------------
    // 2. GET /assets/{assetId}
    // -----------------------------------------------------------------
    if (path.startsWith('/assets/')) {
      const assetId = event.pathParameters?.assetId;
      if (!assetId) return json(400, { error: 'assetId required' });

      const result = await doc.send(new GetCommand({
        TableName: process.env.ASSET_READ_MODEL_TABLE!,
        Key: {
          PK: `TENANT#${effectiveTenantId}`,
          SK: `ASSET#${assetId}`,
        },
      }));

      if (!result.Item) return json(404, { error: 'asset not found' });
      return json(200, result.Item);
    }

    // -----------------------------------------------------------------
    // 3. GET /workflows/{workflowName}
    // -----------------------------------------------------------------
    if (path.startsWith('/workflows/')) {
      const workflowName = event.pathParameters?.workflowName;
      if (!workflowName) return json(400, { error: 'workflowName required' });

      const result = await doc.send(new QueryCommand({
        TableName: process.env.WORKFLOW_READ_MODEL_TABLE!,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${effectiveTenantId}`,
          ':skPrefix': `WF#${workflowName}`,
        },
        ScanIndexForward: false,
        Limit: 50,
      }));

      return json(200, { workflowName, executions: result.Items ?? [] });
    }

    // -----------------------------------------------------------------
    // 4. GET /tenants/{tenantId}/metrics
    // -----------------------------------------------------------------
    if (path.endsWith('/metrics')) {
      const result = await doc.send(new QueryCommand({
        TableName: process.env.METRICS_READ_MODEL_TABLE!,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${effectiveTenantId}#METRICS`,
        },
        ScanIndexForward: false,
        Limit: 30,
      }));

      return json(200, { tenantId: effectiveTenantId, metrics: result.Items ?? [] });
    }

    // -----------------------------------------------------------------
    // 5. GET /tenants/{tenantId}/audit
    // -----------------------------------------------------------------
    if (path.endsWith('/audit')) {
      // Audit trail requires Admin or Service role
      enforceRBAC(auth, 'Admin');

      const result = await doc.send(new QueryCommand({
        TableName: process.env.AUDIT_READ_MODEL_TABLE!,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${effectiveTenantId}`,
          ':skPrefix': 'AUDIT#',
        },
        ScanIndexForward: false,
        Limit: 100,
      }));

      return json(200, { tenantId: effectiveTenantId, auditLog: result.Items ?? [] });
    }

    // -----------------------------------------------------------------
    // 6. GET /tenants/{tenantId}
    // -----------------------------------------------------------------
    if (path.startsWith('/tenants/')) {
      const result = await doc.send(new GetCommand({
        TableName: process.env.TENANT_READ_MODEL_TABLE!,
        Key: {
          PK: `TENANT#${effectiveTenantId}`,
          SK: 'PROFILE',
        },
      }));

      if (!result.Item) {
        return json(200, { tenantId: effectiveTenantId, status: 'ACTIVE', note: 'No recorded profile activity yet' });
      }
      return json(200, result.Item);
    }

    return json(404, { error: 'route not found' });
  } catch (err) {
    if (err instanceof TenantIsolationError || err instanceof RBACError) {
      log.warn('authorization check failed', { error: err.message });
      return json(403, { error: err.message });
    }

    log.error('query failed', err);
    return json(500, { error: 'internal error' });
  }
}
