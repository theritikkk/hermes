"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const domain_1 = require("@hermes/domain");
const doc = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
const handler = async (event) => {
    const detail = event.detail;
    const executionTable = process.env.EXECUTION_READ_MODEL_TABLE;
    const workflowTable = process.env.WORKFLOW_READ_MODEL_TABLE;
    const assetTable = process.env.ASSET_READ_MODEL_TABLE;
    const tenantTable = process.env.TENANT_READ_MODEL_TABLE;
    const metricsTable = process.env.METRICS_READ_MODEL_TABLE;
    const auditTable = process.env.AUDIT_READ_MODEL_TABLE;
    const tenantPk = `TENANT#${detail.tenantId}`;
    const execSk = `EXEC#${detail.correlationId}`;
    try {
        // -------------------------------------------------------------------
        // 1. Audit Read Model: Append audit record for EVERY domain event
        // -------------------------------------------------------------------
        if (auditTable) {
            await doc.send(new lib_dynamodb_1.PutCommand({
                TableName: auditTable,
                Item: {
                    PK: tenantPk,
                    SK: `AUDIT#${detail.occurredAt}#${detail.eventId}`,
                    eventId: detail.eventId,
                    eventType: detail.eventType,
                    tenantId: detail.tenantId,
                    correlationId: detail.correlationId,
                    occurredAt: detail.occurredAt,
                    payload: detail.payload,
                },
            }));
        }
        // -------------------------------------------------------------------
        // 2. Tenant Read Model: Update last activity timestamp & counts
        // -------------------------------------------------------------------
        if (tenantTable) {
            await doc.send(new lib_dynamodb_1.UpdateCommand({
                TableName: tenantTable,
                Key: { PK: tenantPk, SK: 'PROFILE' },
                UpdateExpression: 'SET lastActivityAt = :now, tenantId = :tId ADD totalEventsProcessed :one',
                ExpressionAttributeValues: {
                    ':now': detail.occurredAt,
                    ':tId': detail.tenantId,
                    ':one': 1,
                },
            }));
        }
        // -------------------------------------------------------------------
        // 3. Domain Event Specific Projections
        // -------------------------------------------------------------------
        switch (detail.eventType) {
            case domain_1.EventTypes.AssetRegistered:
                if (assetTable) {
                    await doc.send(new lib_dynamodb_1.PutCommand({
                        TableName: assetTable,
                        Item: {
                            PK: tenantPk,
                            SK: `ASSET#${detail.payload.assetId}`,
                            assetId: detail.payload.assetId,
                            s3Key: detail.payload.s3Key,
                            contentType: detail.payload.contentType,
                            workflowName: detail.payload.workflowName,
                            workflowVersion: detail.payload.workflowVersion,
                            tenantId: detail.tenantId,
                            registeredAt: detail.occurredAt,
                            status: 'REGISTERED',
                        },
                    }));
                }
                break;
            case domain_1.EventTypes.WorkflowExecutionStarted:
                // Update Execution Read Model
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET #status = :running, workflowName = :wfName, workflowVersion = :wfVersion, assetId = :assetId, s3Key = :s3Key, startedAt = :startedAt, tenantId = :tenantId, updatedAt = :now, lastEventId = :eventId',
                    ConditionExpression: 'attribute_not_exists(#status) OR #status = :pending',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':running': 'RUNNING',
                        ':wfName': detail.payload.workflowName,
                        ':wfVersion': detail.payload.workflowVersion,
                        ':assetId': detail.payload.assetId,
                        ':s3Key': detail.payload.s3Key,
                        ':startedAt': detail.occurredAt,
                        ':tenantId': detail.tenantId,
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                        ':pending': 'PENDING',
                    },
                }));
                // Update Workflow Read Model
                if (workflowTable) {
                    const wfName = detail.payload.workflowName;
                    await doc.send(new lib_dynamodb_1.PutCommand({
                        TableName: workflowTable,
                        Item: {
                            PK: tenantPk,
                            SK: `WF#${wfName}#EXEC#${detail.correlationId}`,
                            executionId: detail.correlationId,
                            workflowName: wfName,
                            workflowVersion: detail.payload.workflowVersion,
                            status: 'RUNNING',
                            startedAt: detail.occurredAt,
                            tenantId: detail.tenantId,
                        },
                    }));
                }
                break;
            case domain_1.EventTypes.StepCompleted:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET steps.#stepName = :stepState, updatedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#stepName': detail.payload.stepName },
                    ExpressionAttributeValues: {
                        ':stepState': {
                            status: 'completed',
                            output: detail.payload.output,
                            completedAt: detail.occurredAt,
                        },
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.StepFailed:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET steps.#stepName = :stepState, updatedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#stepName': detail.payload.stepName },
                    ExpressionAttributeValues: {
                        ':stepState': {
                            status: 'failed',
                            error: detail.payload.error,
                            completedAt: detail.occurredAt,
                        },
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.WorkflowExecutionCompleted:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET #status = :completed, output = :output, completedAt = :now, updatedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':completed': 'COMPLETED',
                        ':output': detail.payload.output ?? {},
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                if (workflowTable) {
                    const wfName = detail.payload.workflowName ?? 'default';
                    await doc.send(new lib_dynamodb_1.UpdateCommand({
                        TableName: workflowTable,
                        Key: { PK: tenantPk, SK: `WF#${wfName}#EXEC#${detail.correlationId}` },
                        UpdateExpression: 'SET #status = :completed, completedAt = :now',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':completed': 'COMPLETED',
                            ':now': detail.occurredAt,
                        },
                    }));
                }
                if (metricsTable) {
                    const date = detail.occurredAt.slice(0, 10);
                    await doc.send(new lib_dynamodb_1.UpdateCommand({
                        TableName: metricsTable,
                        Key: { PK: `${tenantPk}#METRICS`, SK: `DATE#${date}` },
                        UpdateExpression: 'ADD completedExecutions :one SET tenantId = :tId, date = :d',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':tId': detail.tenantId,
                            ':d': date,
                        },
                    }));
                }
                break;
            case domain_1.EventTypes.WorkflowExecutionFailed:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET #status = :failed, failureReason = :reason, failedStep = :failedStep, completedAt = :now, updatedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':failed': 'FAILED',
                        ':reason': detail.payload.reason,
                        ':failedStep': detail.payload.failedStep ?? null,
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                if (workflowTable) {
                    const wfName = detail.payload.workflowName ?? 'default';
                    await doc.send(new lib_dynamodb_1.UpdateCommand({
                        TableName: workflowTable,
                        Key: { PK: tenantPk, SK: `WF#${wfName}#EXEC#${detail.correlationId}` },
                        UpdateExpression: 'SET #status = :failed, failureReason = :reason, completedAt = :now',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':failed': 'FAILED',
                            ':reason': detail.payload.reason,
                            ':now': detail.occurredAt,
                        },
                    }));
                }
                if (metricsTable) {
                    const date = detail.occurredAt.slice(0, 10);
                    await doc.send(new lib_dynamodb_1.UpdateCommand({
                        TableName: metricsTable,
                        Key: { PK: `${tenantPk}#METRICS`, SK: `DATE#${date}` },
                        UpdateExpression: 'ADD failedExecutions :one SET tenantId = :tId, date = :d',
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':tId': detail.tenantId,
                            ':d': date,
                        },
                    }));
                }
                break;
            case domain_1.EventTypes.RetryScheduled:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET steps.#stepName = :stepState, updatedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#stepName': detail.payload.stepName },
                    ExpressionAttributeValues: {
                        ':stepState': {
                            status: 'retry_scheduled',
                            attemptNumber: detail.payload.attemptNumber,
                            nextAttemptAt: detail.payload.nextAttemptAt,
                            error: detail.payload.error,
                        },
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.SnapshotCreated:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET lastSnapshotSeq = :seq, lastSnapshotAt = :now, lastEventId = :eventId',
                    ExpressionAttributeValues: {
                        ':seq': detail.payload.sequence,
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.WebhookDelivered:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET webhookDelivered = :delivered, webhookStatus = :status, webhookDeliveredAt = :now, lastEventId = :eventId',
                    ExpressionAttributeValues: {
                        ':delivered': true,
                        ':status': detail.payload.httpStatus,
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.NotificationSent:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET notificationSent = :sent, notificationChannel = :channel, notificationSentAt = :now, lastEventId = :eventId',
                    ExpressionAttributeValues: {
                        ':sent': true,
                        ':channel': detail.payload.channel,
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.ExecutionCancelled:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET #status = :cancelled, cancelReason = :reason, cancelledBy = :by, completedAt = :now, updatedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':cancelled': 'CANCELLED',
                        ':reason': detail.payload.reason,
                        ':by': detail.payload.cancelledBy,
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.ExecutionTimedOut:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET #status = :timedOut, completedAt = :now, updatedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':timedOut': 'TIMED_OUT',
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            case domain_1.EventTypes.ExecutionRetried:
                await doc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: executionTable,
                    Key: { PK: tenantPk, SK: execSk },
                    UpdateExpression: 'SET #status = :running, retryCount = if_not_exists(retryCount, :zero) + :one, retriedAt = :now, lastEventId = :eventId',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':running': 'RUNNING',
                        ':zero': 0,
                        ':one': 1,
                        ':now': detail.occurredAt,
                        ':eventId': detail.eventId,
                    },
                }));
                break;
            default:
                return;
        }
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            service: 'execution-projection',
            message: 'projections updated',
            tenantId: detail.tenantId,
            executionId: detail.correlationId,
            eventType: detail.eventType,
            eventId: detail.eventId,
        }));
    }
    catch (error) {
        if (error instanceof client_dynamodb_1.ConditionalCheckFailedException) {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'WARN',
                service: 'execution-projection',
                message: 'projection update skipped (conditional check failed)',
                tenantId: detail.tenantId,
                executionId: detail.correlationId,
                eventType: detail.eventType,
                eventId: detail.eventId,
            }));
        }
        else {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'ERROR',
                service: 'execution-projection',
                message: 'projection update failed',
                tenantId: detail.tenantId,
                executionId: detail.correlationId,
                eventType: detail.eventType,
                eventId: detail.eventId,
                error: error instanceof Error ? error.message : String(error),
            }));
            throw error;
        }
    }
};
exports.handler = handler;
