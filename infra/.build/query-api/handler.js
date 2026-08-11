"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const domain_1 = require("@hermes/domain");
const observability_1 = require("@hermes/observability");
const doc = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
function json(statusCode, body) {
    return {
        statusCode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    };
}
async function handler(event) {
    const auth = (0, domain_1.extractAuthContext)(event);
    const log = (0, observability_1.createLogger)({ service: 'query-api', tenantId: auth.tenantId, userId: auth.userId });
    const path = event.rawPath;
    try {
        // Enforce base read access (User, Admin, or Service role required)
        (0, domain_1.enforceRBAC)(auth, 'User');
        // Extract requested tenantId if present in path, and enforce strict tenant isolation
        const requestedTenantId = event.pathParameters?.tenantId;
        const effectiveTenantId = (0, domain_1.enforceTenantIsolation)(auth, requestedTenantId);
        log.info('processing query request', { path, roles: auth.roles, effectiveTenantId });
        // -----------------------------------------------------------------
        // 1. GET /executions/{executionId}
        // -----------------------------------------------------------------
        if (path.startsWith('/executions/')) {
            const executionId = event.pathParameters?.executionId;
            if (!executionId)
                return json(400, { error: 'executionId required' });
            const result = await doc.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.EXECUTION_READ_MODEL_TABLE,
                Key: {
                    PK: `TENANT#${effectiveTenantId}`,
                    SK: `EXEC#${executionId}`,
                },
            }));
            if (!result.Item)
                return json(404, { error: 'execution not found' });
            return json(200, result.Item);
        }
        // -----------------------------------------------------------------
        // 2. GET /assets/{assetId}
        // -----------------------------------------------------------------
        if (path.startsWith('/assets/')) {
            const assetId = event.pathParameters?.assetId;
            if (!assetId)
                return json(400, { error: 'assetId required' });
            const result = await doc.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ASSET_READ_MODEL_TABLE,
                Key: {
                    PK: `TENANT#${effectiveTenantId}`,
                    SK: `ASSET#${assetId}`,
                },
            }));
            if (!result.Item)
                return json(404, { error: 'asset not found' });
            return json(200, result.Item);
        }
        // -----------------------------------------------------------------
        // 3. GET /workflows/{workflowName}
        // -----------------------------------------------------------------
        if (path.startsWith('/workflows/')) {
            const workflowName = event.pathParameters?.workflowName;
            if (!workflowName)
                return json(400, { error: 'workflowName required' });
            const result = await doc.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.WORKFLOW_READ_MODEL_TABLE,
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
            const result = await doc.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.METRICS_READ_MODEL_TABLE,
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
            (0, domain_1.enforceRBAC)(auth, 'Admin');
            const result = await doc.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.AUDIT_READ_MODEL_TABLE,
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
            const result = await doc.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.TENANT_READ_MODEL_TABLE,
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
    }
    catch (err) {
        if (err instanceof domain_1.TenantIsolationError || err instanceof domain_1.RBACError) {
            log.warn('authorization check failed', { error: err.message });
            return json(403, { error: err.message });
        }
        log.error('query failed', err);
        return json(500, { error: 'internal error' });
    }
}
