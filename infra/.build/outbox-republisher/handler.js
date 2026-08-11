"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const observability_1 = require("@hermes/observability");
const dynamo = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
const eventBridge = new client_eventbridge_1.EventBridgeClient({});
const STALE_MINUTES = parseInt(process.env.STALE_THRESHOLD_MINUTES ?? '5', 10);
const PAGE_SIZE = 25; // max items to republish per invocation
const handler = async (event) => {
    const tableName = process.env.EVENT_STORE_TABLE;
    const busName = process.env.EVENT_BUS_NAME;
    if (!tableName || !busName) {
        throw new Error('Missing EVENT_STORE_TABLE or EVENT_BUS_NAME');
    }
    const log = (0, observability_1.createLogger)({ service: 'outbox-republisher' });
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
    log.info('scanning for stale outbox events', { cutoff, staleMinutes: STALE_MINUTES });
    // Scan for PENDING events older than the cutoff. A GSI on outboxStatus would
    // be more efficient at scale; a full scan is acceptable for the dev environment
    // and low-volume cases where this pattern is needed as a safety net.
    const scanResult = await dynamo.send(new lib_dynamodb_1.ScanCommand({
        TableName: tableName,
        FilterExpression: 'itemType = :eventType AND outboxStatus = :pending AND occurredAt < :cutoff',
        ExpressionAttributeValues: {
            ':eventType': 'EVENT',
            ':pending': 'PENDING',
            ':cutoff': cutoff,
        },
        Limit: PAGE_SIZE,
    }));
    const staleItems = scanResult.Items ?? [];
    if (staleItems.length === 0) {
        log.info('no stale outbox events found');
        return;
    }
    log.info('found stale events to republish', { count: staleItems.length });
    let republishedCount = 0;
    for (const item of staleItems) {
        const detail = {
            eventId: item.eventId,
            eventType: item.eventType,
            eventVersion: item.eventVersion,
            aggregateType: item.aggregateType,
            aggregateId: item.aggregateId,
            tenantId: item.tenantId,
            correlationId: item.correlationId,
            occurredAt: item.occurredAt,
            sequence: item.sequence,
            payload: item.payload,
        };
        try {
            const result = await eventBridge.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [{
                        EventBusName: busName,
                        Source: 'hermes.outbox-republisher',
                        DetailType: item.eventType,
                        Detail: JSON.stringify(detail),
                    }],
            }));
            if (result.FailedEntryCount && result.FailedEntryCount > 0) {
                throw new Error(`EventBridge rejected entry for eventId=${item.eventId}`);
            }
            // Mark published in the event store
            await dynamo.send(new lib_dynamodb_1.UpdateCommand({
                TableName: tableName,
                Key: { PK: item.PK, SK: item.SK },
                UpdateExpression: 'SET outboxStatus = :published, publishedAt = :now',
                ConditionExpression: 'outboxStatus = :pending',
                ExpressionAttributeValues: {
                    ':published': 'PUBLISHED',
                    ':pending': 'PENDING',
                    ':now': new Date().toISOString(),
                },
            }));
            log.info('republished stale event', {
                eventId: item.eventId,
                eventType: item.eventType,
                originalOccurredAt: item.occurredAt,
            });
            republishedCount++;
        }
        catch (err) {
            log.error('failed to republish event', err, {
                eventId: item.eventId,
                eventType: item.eventType,
            });
            // Continue processing remaining events — partial success is fine
        }
    }
    log.info('republishing complete', { republishedCount, total: staleItems.length });
    // CloudWatch EMF metric
    console.log(JSON.stringify({
        _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [{
                    Namespace: 'Hermes/Outbox',
                    Dimensions: [['service']],
                    Metrics: [{ Name: 'RepublishedEventCount', Unit: 'Count' }],
                }],
        },
        service: 'outbox-republisher',
        RepublishedEventCount: republishedCount,
    }));
};
exports.handler = handler;
