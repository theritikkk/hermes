"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const eventBridge = new client_eventbridge_1.EventBridgeClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
const log = (level, message, fields) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'outbox-publisher', message, ...fields }));
const handler = async (event) => {
    const busName = process.env.EVENT_BUS_NAME;
    const tableName = process.env.EVENT_STORE_TABLE;
    if (!busName || !tableName) {
        throw new Error('Missing EVENT_BUS_NAME or EVENT_STORE_TABLE');
    }
    for (const record of event.Records) {
        let ddbRecord;
        try {
            ddbRecord = JSON.parse(record.body);
        }
        catch (err) {
            log('ERROR', 'Failed to parse SQS body', { error: String(err), body: record.body });
            continue;
        }
        if (!ddbRecord.dynamodb?.NewImage) {
            continue;
        }
        const newImage = (0, util_dynamodb_1.unmarshall)(ddbRecord.dynamodb.NewImage);
        if (newImage.outboxStatus !== 'PENDING') {
            continue;
        }
        const detail = {
            eventId: newImage.eventId,
            eventType: newImage.eventType,
            eventVersion: newImage.eventVersion,
            aggregateType: newImage.aggregateType,
            aggregateId: newImage.aggregateId,
            tenantId: newImage.tenantId,
            correlationId: newImage.correlationId,
            occurredAt: newImage.occurredAt,
            sequence: newImage.sequence,
            payload: newImage.payload,
        };
        const entry = {
            EventBusName: busName,
            Source: 'hermes', // adjust if needed
            DetailType: newImage.eventType,
            Detail: JSON.stringify(detail),
        };
        const putEventsResponse = await eventBridge.send(new client_eventbridge_1.PutEventsCommand({ Entries: [entry] }));
        if (putEventsResponse.FailedEntryCount && putEventsResponse.FailedEntryCount > 0) {
            log('ERROR', 'EventBridge publish failed', { failedCount: putEventsResponse.FailedEntryCount });
            throw new Error(`EventBridge publish failed for ${putEventsResponse.FailedEntryCount} entries`);
        }
        const keys = (0, util_dynamodb_1.unmarshall)(ddbRecord.dynamodb.Keys);
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: tableName,
            Key: { PK: keys.PK, SK: keys.SK },
            UpdateExpression: 'SET outboxStatus = :published, publishedAt = :now',
            ExpressionAttributeValues: {
                ':published': 'PUBLISHED',
                ':now': new Date().toISOString(),
            },
        }));
        log('INFO', 'Successfully published and updated outbox item', {
            eventId: newImage.eventId,
            eventType: newImage.eventType,
            pk: keys.PK,
            sk: keys.SK,
        });
    }
};
exports.handler = handler;
