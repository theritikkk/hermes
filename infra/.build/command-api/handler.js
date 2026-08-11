"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const node_crypto_1 = require("node:crypto");
const client_sfn_1 = require("@aws-sdk/client-sfn");
const domain_1 = require("@hermes/domain");
const event_store_1 = require("@hermes/event-store");
const command_handlers_1 = require("@hermes/command-handlers");
const observability_1 = require("@hermes/observability");
const eventStore = new event_store_1.DynamoEventStore(process.env.EVENT_STORE_TABLE);
const publisher = new event_store_1.EventBridgePublisher(process.env.EVENT_BUS_NAME, 'hermes.command-api');
const sfn = new client_sfn_1.SFNClient({});
function json(statusCode, body) {
    return {
        statusCode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    };
}
async function handler(event) {
    const auth = (0, domain_1.extractAuthContext)(event);
    const log = (0, observability_1.createLogger)({
        service: 'command-api',
        correlationId: (0, node_crypto_1.randomUUID)(),
        tenantId: auth.tenantId,
        userId: auth.userId,
    });
    try {
        const method = event.requestContext.http.method;
        const path = event.rawPath;
        // -----------------------------------------------------------------
        // 1. POST /assets (RegisterAsset command)
        // -----------------------------------------------------------------
        if (method === 'POST' && path === '/assets') {
            // User or Admin role required
            (0, domain_1.enforceRBAC)(auth, 'User');
            const body = JSON.parse(event.body ?? '{}');
            const effectiveTenantId = (0, domain_1.enforceTenantIsolation)(auth, body.tenantId);
            const command = {
                commandType: 'RegisterAsset',
                tenantId: effectiveTenantId,
                assetId: body.assetId ?? (0, node_crypto_1.randomUUID)(),
                s3Key: body.s3Key,
                contentType: body.contentType ?? 'application/octet-stream',
                workflowName: body.workflowName,
                workflowVersion: body.workflowVersion,
                clientRequestId: body.clientRequestId,
            };
            if (!command.s3Key) {
                return json(400, { error: 's3Key is required' });
            }
            const result = await (0, command_handlers_1.handleRegisterAsset)(command, { eventStore, publisher });
            log.info('RegisterAsset command accepted', {
                executionId: result.executionId,
                tenantId: command.tenantId,
                roles: auth.roles,
            });
            return json(202, result);
        }
        // -----------------------------------------------------------------
        // 2. POST /step-results (RecordStepResult command)
        // -----------------------------------------------------------------
        if (method === 'POST' && path === '/step-results') {
            // Service or Admin role required
            (0, domain_1.enforceRBAC)(auth, 'Service');
            const body = JSON.parse(event.body ?? '{}');
            const effectiveTenantId = (0, domain_1.enforceTenantIsolation)(auth, body.tenantId);
            const command = {
                commandType: 'RecordStepResult',
                tenantId: effectiveTenantId,
                executionId: body.executionId,
                stepName: body.stepName,
                status: body.status ?? 'completed',
                output: body.output,
                error: body.error,
                retryable: body.retryable,
            };
            if (!command.executionId || !command.stepName) {
                return json(400, { error: 'executionId and stepName are required' });
            }
            const result = await (0, command_handlers_1.handleRecordStepResult)(command, { eventStore, publisher });
            log.info('RecordStepResult command accepted', {
                executionId: command.executionId,
                tenantId: command.tenantId,
                stepName: command.stepName,
            });
            return json(202, result);
        }
        return json(404, { error: 'not found' });
    }
    catch (err) {
        if (err instanceof domain_1.TenantIsolationError || err instanceof domain_1.RBACError) {
            log.warn('authorization check failed', { error: err.message });
            return json(403, { error: err.message });
        }
        log.error('command execution failed', err);
        return json(500, { error: 'internal error' });
    }
}
