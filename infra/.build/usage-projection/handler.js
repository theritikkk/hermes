"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const domain_1 = require("@hermes/domain");
const observability_1 = require("@hermes/observability");
const dynamo = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
function monthKey(isoDate) {
    return isoDate.slice(0, 7); // "YYYY-MM"
}
function counterField(eventType) {
    switch (eventType) {
        case domain_1.EventTypes.WorkflowExecutionStarted: return 'executionsStarted';
        case domain_1.EventTypes.WorkflowExecutionCompleted: return 'executionsCompleted';
        case domain_1.EventTypes.WorkflowExecutionFailed: return 'executionsFailed';
        case domain_1.EventTypes.ExecutionCancelled: return 'executionsCancelled';
        case domain_1.EventTypes.ExecutionTimedOut: return 'executionsTimedOut';
        case domain_1.EventTypes.ExecutionRetried: return 'executionsRetried';
        case domain_1.EventTypes.StepCompleted: return 'stepsCompleted';
        case domain_1.EventTypes.StepFailed: return 'stepsFailed';
        case domain_1.EventTypes.RetryScheduled: return 'retriesScheduled';
        case domain_1.EventTypes.SnapshotCreated: return 'snapshotsCreated';
        case domain_1.EventTypes.WebhookDelivered: return 'webhooksDelivered';
        case domain_1.EventTypes.NotificationSent: return 'notificationsSent';
        default: return null;
    }
}
const handler = async (event) => {
    const detail = event.detail;
    const tableName = process.env.EXECUTION_READ_MODEL_TABLE;
    if (!tableName)
        throw new Error('Missing EXECUTION_READ_MODEL_TABLE');
    const log = (0, observability_1.createLogger)({
        service: 'usage-projection',
        tenantId: detail.tenantId,
        correlationId: detail.correlationId,
    });
    const field = counterField(detail.eventType);
    if (!field) {
        // Event type not relevant to usage counters
        return;
    }
    const month = monthKey(detail.occurredAt);
    const pk = `USAGE#${detail.tenantId}`;
    const sk = `MONTH#${month}`;
    await dynamo.send(new lib_dynamodb_1.UpdateCommand({
        TableName: tableName,
        Key: { PK: pk, SK: sk },
        UpdateExpression: 'ADD #counter :one SET tenantId = :tenantId, #month = :month, updatedAt = :now',
        ExpressionAttributeNames: {
            '#counter': field,
            '#month': 'month',
        },
        ExpressionAttributeValues: {
            ':one': 1,
            ':tenantId': detail.tenantId,
            ':month': month,
            ':now': new Date().toISOString(),
        },
    }));
    log.info('usage counter incremented', {
        tenantId: detail.tenantId,
        month,
        field,
        eventType: detail.eventType,
    });
    // CloudWatch EMF metric
    console.log(JSON.stringify({
        _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [{
                    Namespace: 'Hermes/Usage',
                    Dimensions: [['tenantId', 'eventType']],
                    Metrics: [{ Name: 'UsageEventProcessed', Unit: 'Count' }],
                }],
        },
        tenantId: detail.tenantId,
        eventType: detail.eventType,
        UsageEventProcessed: 1,
    }));
};
exports.handler = handler;
