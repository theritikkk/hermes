package com.hermes.replay.infrastructure.eventstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hermes.replay.domain.DomainEvent;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;

import java.time.Instant;
import java.util.*;

/**
 * Snapshot-aware DynamoDB event store reader.
 *
 * <p><b>Snapshot optimization</b>: Before loading all events from sequence 0,
 * this reader checks {@link SnapshotStore} for a recent snapshot. If found,
 * only events after {@code snapshot.atSequence} are fetched from DynamoDB,
 * dramatically reducing RCU consumption for long-running executions.
 *
 * <p><b>Metrics</b>: Records CloudWatch metrics for:
 * <ul>
 *   <li>{@code hermes.eventstore.snapshot.hit} — snapshot found, partial load</li>
 *   <li>{@code hermes.eventstore.snapshot.miss} — no snapshot, full stream load</li>
 *   <li>{@code hermes.eventstore.events.loaded} — number of events fetched per call</li>
 * </ul>
 *
 * <p><b>Pagination</b>: Handles DynamoDB's 1 MB response limit via
 * {@code LastEvaluatedKey} continuation tokens, ensuring complete streams
 * are always returned regardless of size.
 */
@Repository
public class DynamoDbEventStoreReader {

    private static final Logger log = LoggerFactory.getLogger(DynamoDbEventStoreReader.class);

    private final DynamoDbClient dynamoDbClient;
    private final SnapshotStore snapshotStore;
    private final String tableName;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;

    public DynamoDbEventStoreReader(
            DynamoDbClient dynamoDbClient,
            SnapshotStore snapshotStore,
            @Value("${hermes.event-store.table-name:hermes-dev-event-store}") String tableName,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry) {
        this.dynamoDbClient = dynamoDbClient;
        this.snapshotStore = snapshotStore;
        this.tableName = tableName;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
    }

    // ── Public API ────────────────────────────────────────────────────────

    /**
     * Loads the full event stream for an aggregate, using a snapshot to skip
     * already-processed events when one is available.
     *
     * <p>The returned list is ordered by sequence number (ascending).
     * Events before the snapshot boundary are NOT included — callers needing
     * the pre-snapshot state must reconstruct it from the snapshot's
     * {@code stateJson} field.
     *
     * @param aggregateType e.g. "EXECUTION"
     * @param aggregateId   the aggregate identifier
     * @return ordered list of events after the latest snapshot (or all events if no snapshot)
     */
    public List<DomainEvent> loadEventStream(String aggregateType, String aggregateId) {
        Optional<AggregateSnapshot> snapshot = snapshotStore.loadLatestSnapshot(aggregateType, aggregateId);

        if (snapshot.isPresent()) {
            int resumeFrom = snapshot.get().resumeFromSequence();
            log.info("[EventStoreReader] Snapshot HIT — loading from sequence {} for {}#{}",
                    resumeFrom, aggregateType, aggregateId);
            meterRegistry.counter("hermes.eventstore.snapshot.hit",
                    Tags.of("aggregateType", aggregateType)).increment();
            return loadEventStreamFrom(aggregateType, aggregateId, resumeFrom);
        }

        log.debug("[EventStoreReader] Snapshot MISS — full stream load for {}#{}", aggregateType, aggregateId);
        meterRegistry.counter("hermes.eventstore.snapshot.miss",
                Tags.of("aggregateType", aggregateType)).increment();
        return loadEventStreamFrom(aggregateType, aggregateId, 0);
    }

    /**
     * Loads events starting at (and including) {@code fromSequence}.
     * Used directly by the replay engine for point-in-time boundary loading.
     *
     * @param aggregateType  e.g. "EXECUTION"
     * @param aggregateId    the aggregate identifier
     * @param fromSequence   load events with sequence &gt;= this value (0 = from beginning)
     * @return ordered list of events from the given sequence
     */
    public List<DomainEvent> loadEventStreamFrom(
            String aggregateType, String aggregateId, int fromSequence) {

        String pk = aggregateType.toUpperCase() + "#" + aggregateId;
        String skStart = "EVT#" + String.format("%010d", fromSequence);

        List<DomainEvent> events = new ArrayList<>();
        Map<String, AttributeValue> lastEvaluatedKey = null;

        // Paginate through all pages (DynamoDB 1 MB limit per Query)
        do {
            QueryRequest.Builder queryBuilder = QueryRequest.builder()
                    .tableName(tableName)
                    .keyConditionExpression("PK = :pk AND SK >= :skStart")
                    .filterExpression("begins_with(SK, :evtPrefix)")
                    .expressionAttributeValues(Map.of(
                            ":pk", AttributeValue.fromS(pk),
                            ":skStart", AttributeValue.fromS(skStart),
                            ":evtPrefix", AttributeValue.fromS("EVT#")
                    ))
                    .scanIndexForward(true);

            if (lastEvaluatedKey != null) {
                queryBuilder.exclusiveStartKey(lastEvaluatedKey);
            }

            QueryResponse response = dynamoDbClient.query(queryBuilder.build());

            for (Map<String, AttributeValue> item : response.items()) {
                events.add(mapToDomainEvent(item));
            }

            lastEvaluatedKey = response.lastEvaluatedKey().isEmpty() ? null : response.lastEvaluatedKey();

        } while (lastEvaluatedKey != null);

        meterRegistry.summary("hermes.eventstore.events.loaded",
                Tags.of("aggregateType", aggregateType)).record(events.size());

        log.debug("[EventStoreReader] Loaded {} events for {}#{} from sequence {}",
                events.size(), aggregateType, aggregateId, fromSequence);

        return Collections.unmodifiableList(events);
    }

    // ── Private ──────────────────────────────────────────────────────────

    private DomainEvent mapToDomainEvent(Map<String, AttributeValue> item) {
        String eventId      = strAttr(item, "eventId");
        String eventType    = strAttr(item, "eventType");
        String aggregateType = strAttr(item, "aggregateType");
        String aggregateId  = strAttr(item, "aggregateId");
        String tenantId     = strAttr(item, "tenantId");
        String correlationId = strAttr(item, "correlationId");

        Instant occurredAt = item.containsKey("occurredAt")
                ? Instant.parse(item.get("occurredAt").s()) : Instant.now();

        int sequence = item.containsKey("sequence")
                ? Integer.parseInt(item.get("sequence").n()) : 0;

        Map<String, Object> payload = Collections.emptyMap();
        if (item.containsKey("payload") && item.get("payload").s() != null) {
            try {
                payload = objectMapper.readValue(item.get("payload").s(), new TypeReference<>() {});
            } catch (Exception e) {
                log.warn("[EventStoreReader] Failed to deserialize payload for eventId={}: {}",
                        eventId, e.getMessage());
            }
        }

        return new DomainEvent(
                eventId, eventType, aggregateType, aggregateId,
                tenantId, correlationId, occurredAt, sequence, payload);
    }

    private String strAttr(Map<String, AttributeValue> item, String key) {
        return item.containsKey(key) ? item.get(key).s() : "";
    }
}
