"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const event_store_1 = require("@hermes/event-store");
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
const log = (level, message, fields) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'snapshot-trigger', message, ...fields }));
const handler = async (event) => {
    const tableName = process.env.EVENT_STORE_TABLE;
    const threshold = parseInt(process.env.SNAPSHOT_THRESHOLD || '50', 10);
    if (!tableName) {
        throw new Error('Missing EVENT_STORE_TABLE');
    }
    const store = new event_store_1.DynamoEventStore(tableName, docClient);
    for (const record of event.Records) {
        if (record.eventName !== 'INSERT' || !record.dynamodb?.NewImage) {
            continue;
        }
        const newImage = (0, util_dynamodb_1.unmarshall)(record.dynamodb.NewImage);
        if (newImage.itemType !== 'EVENT') {
            continue;
        }
        const sequence = newImage.sequence;
        if (typeof sequence !== 'number' || sequence % threshold !== 0) {
            continue;
        }
        const pk = newImage.PK;
        const aggregateType = newImage.aggregateType;
        const aggregateId = newImage.aggregateId;
        try {
            const events = await store.loadStream(aggregateType, aggregateId);
            const applyEvent = (state, ev) => {
                // Reducer logic: simplistic merge for demonstration purposes,
                // ideally handled by domain logic.
                return { ...state, ...ev.payload };
            };
            const aggregateState = (0, event_store_1.replayAggregate)(events, {}, applyEvent);
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: tableName,
                Item: {
                    PK: pk,
                    SK: `SNAP#${String(sequence).padStart(10, '0')}`,
                    aggregateState,
                    takenAtSequence: sequence,
                    takenAt: new Date().toISOString(),
                    schemaVersion: 1,
                    itemType: 'SNAPSHOT',
                },
            }));
            log('INFO', 'Snapshot created successfully', {
                aggregateType,
                aggregateId,
                sequence,
                snapshotThreshold: threshold
            });
        }
        catch (err) {
            log('ERROR', 'Failed to create snapshot', {
                aggregateType,
                aggregateId,
                sequence,
                error: String(err)
            });
            throw err;
        }
    }
};
exports.handler = handler;
