"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const domain_1 = require("@hermes/domain");
const observability_1 = require("@hermes/observability");
function monthSuffix(isoDate) {
    return isoDate.slice(0, 7).replace('-', '.'); // "YYYY.MM"
}
async function bulkIndex(endpoint, indexName, docId, doc) {
    const meta = JSON.stringify({ index: { _index: indexName, _id: docId } });
    const body = JSON.stringify(doc);
    const ndjson = `${meta}\n${body}\n`;
    const url = `https://${endpoint}/_bulk`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: ndjson,
        signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenSearch bulk failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    const result = (await res.json());
    if (result.errors) {
        throw new Error(`OpenSearch bulk had errors: ${JSON.stringify(result).slice(0, 300)}`);
    }
}
const handler = async (event) => {
    const detail = event.detail;
    const endpoint = process.env.OPENSEARCH_ENDPOINT;
    const log = (0, observability_1.createLogger)({
        service: 'opensearch-projection',
        tenantId: detail.tenantId,
        correlationId: detail.correlationId,
    });
    if (!endpoint) {
        log.warn('OPENSEARCH_ENDPOINT not set, skipping indexing');
        return;
    }
    // Index all execution lifecycle events
    const relevant = Object.values(domain_1.EventTypes);
    if (!relevant.includes(detail.eventType)) {
        return;
    }
    const executionId = detail.correlationId;
    const indexName = `hermes-executions-${monthSuffix(detail.occurredAt)}`;
    // Build a flat, searchable document from the event
    const doc = {
        executionId,
        tenantId: detail.tenantId,
        lastEventType: detail.eventType,
        lastEventId: detail.eventId,
        lastEventAt: detail.occurredAt,
        indexedAt: new Date().toISOString(),
        ...detail.payload,
    };
    // For step events, nest the step output under the step name
    if (detail.eventType === domain_1.EventTypes.StepCompleted ||
        detail.eventType === domain_1.EventTypes.StepFailed ||
        detail.eventType === domain_1.EventTypes.RetryScheduled) {
        const stepName = detail.payload.stepName;
        if (stepName) {
            doc[`step_${stepName}`] = {
                status: detail.eventType === domain_1.EventTypes.StepCompleted
                    ? 'completed'
                    : detail.eventType === domain_1.EventTypes.StepFailed
                        ? 'failed'
                        : 'retry_scheduled',
                ...(detail.payload.output ?? {}),
                ...(detail.payload.error ? { error: detail.payload.error } : {}),
                completedAt: detail.occurredAt,
            };
        }
    }
    try {
        await bulkIndex(endpoint, indexName, executionId, doc);
        log.info('document indexed', {
            index: indexName,
            docId: executionId,
            eventType: detail.eventType,
        });
        // CloudWatch EMF metric
        console.log(JSON.stringify({
            _aws: {
                Timestamp: Date.now(),
                CloudWatchMetrics: [{
                        Namespace: 'Hermes/OpenSearch',
                        Dimensions: [['tenantId', 'eventType']],
                        Metrics: [{ Name: 'DocumentsIndexed', Unit: 'Count' }],
                    }],
            },
            tenantId: detail.tenantId,
            eventType: detail.eventType,
            DocumentsIndexed: 1,
        }));
    }
    catch (err) {
        log.error('failed to index document', err, {
            index: indexName,
            docId: executionId,
        });
        throw err; // rethrow so EventBridge can retry / DLQ
    }
};
exports.handler = handler;
