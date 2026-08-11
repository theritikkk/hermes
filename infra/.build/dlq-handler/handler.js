"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const observability_1 = require("@hermes/observability");
const dynamo = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
const POISON_THRESHOLD = parseInt(process.env.POISON_THRESHOLD ?? '5', 10);
function parseMessage(rawBody) {
    try {
        const outer = JSON.parse(rawBody);
        const inner = typeof outer.originalMessage === 'string'
            ? JSON.parse(outer.originalMessage)
            : (outer.originalMessage ?? outer);
        return {
            tenantId: (inner.tenantId ?? outer.tenantId ?? 'unknown'),
            eventId: (inner.eventId ?? outer.eventId),
            eventType: (inner.eventType ?? outer.eventType),
            originalBody: inner,
            errorContext: outer.errorContext ?? null,
        };
    }
    catch {
        return { tenantId: 'unknown', originalBody: rawBody };
    }
}
function classify(receiveCount) {
    if (receiveCount >= POISON_THRESHOLD)
        return 'POISON';
    if (receiveCount > 0)
        return 'TRANSIENT';
    return 'UNKNOWN';
}
const handler = async (event) => {
    const tableName = process.env.EVENT_STORE_TABLE;
    for (const record of event.Records) {
        const receiveCount = parseInt(record.attributes?.ApproximateReceiveCount ?? '0', 10);
        const queueName = (record.eventSourceARN ?? '').split(':').pop() ??
            process.env.DLQ_NAME ??
            'unknown';
        const parsed = parseMessage(record.body);
        const classification = classify(receiveCount);
        const log = (0, observability_1.createLogger)({
            service: 'dlq-handler',
            tenantId: parsed.tenantId,
            correlationId: parsed.eventId,
        });
        log.critical('DLQ message received', {
            queue: queueName,
            messageId: record.messageId,
            receiveCount,
            classification,
            eventId: parsed.eventId,
            eventType: parsed.eventType,
            errorContext: parsed.errorContext,
        });
        // Persist to event store for audit + redrive tooling
        if (tableName) {
            try {
                await dynamo.send(new lib_dynamodb_1.PutCommand({
                    TableName: tableName,
                    Item: {
                        PK: `DLQ#${queueName}`,
                        SK: `MSG#${record.messageId}`,
                        itemType: 'DLQ_EVENT',
                        classification,
                        messageId: record.messageId,
                        receiveCount,
                        tenantId: parsed.tenantId,
                        eventId: parsed.eventId,
                        eventType: parsed.eventType,
                        originalBody: parsed.originalBody,
                        errorContext: parsed.errorContext,
                        queueName,
                        arrivedAt: new Date().toISOString(),
                        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 day TTL
                    },
                    // Don't overwrite if already persisted (duplicate delivery)
                    ConditionExpression: 'attribute_not_exists(SK)',
                }));
                log.info('DLQ event persisted for audit', { messageId: record.messageId, classification });
            }
            catch (err) {
                const isConditionalCheck = err instanceof Error && err.name === 'ConditionalCheckFailedException';
                if (!isConditionalCheck) {
                    log.error('failed to persist DLQ event', err, { messageId: record.messageId });
                    // Non-fatal: logging + metric still proceed
                }
            }
        }
        // CloudWatch EMF metric — one per message
        console.log(JSON.stringify({
            _aws: {
                Timestamp: Date.now(),
                CloudWatchMetrics: [{
                        Namespace: 'Hermes/Operations',
                        Dimensions: [['queue', 'tenantId', 'classification']],
                        Metrics: [{ Name: 'DLQMessageCount', Unit: 'Count' }],
                    }],
            },
            queue: queueName,
            tenantId: parsed.tenantId,
            classification,
            DLQMessageCount: 1,
        }));
    }
};
exports.handler = handler;
