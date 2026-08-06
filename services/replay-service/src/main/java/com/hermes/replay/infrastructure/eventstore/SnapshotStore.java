package com.hermes.replay.infrastructure.eventstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/**
 * Reads and writes aggregate snapshots in the DynamoDB event store table.
 *
 * <p><b>Storage layout</b>: Snapshots are stored as items with
 * {@code SK = SNAP#<sequence>} in the same table as events. A Query
 * with {@code begins_with(SK, "SNAP#")} and {@code ScanIndexForward=false}
 * returns the latest snapshot in a single read at O(1) cost.
 *
 * <p><b>Conditional write</b>: {@link #saveSnapshot} uses a
 * {@code ConditionExpression} to only write the snapshot if no snapshot
 * at a higher sequence exists, preventing races between concurrent
 * snapshot-trigger Lambda invocations.
 *
 * <p><b>Graceful degradation</b>: If DynamoDB is unavailable or the
 * snapshot item is malformed, all methods log a warning and return
 * {@code Optional.empty()}, allowing the caller to fall back to full
 * event stream loading.
 */
@Repository
public class SnapshotStore {

    private static final Logger log = LoggerFactory.getLogger(SnapshotStore.class);
    private static final String SNAP_SK_PREFIX = "SNAP#";

    private final DynamoDbClient dynamoDbClient;
    private final String tableName;
    private final ObjectMapper objectMapper;

    public SnapshotStore(
            DynamoDbClient dynamoDbClient,
            @Value("${hermes.event-store.table-name:hermes-dev-event-store}") String tableName,
            ObjectMapper objectMapper) {
        this.dynamoDbClient = dynamoDbClient;
        this.tableName = tableName;
        this.objectMapper = objectMapper;
    }

    // ── Read ──────────────────────────────────────────────────────────────

    /**
     * Loads the most recent snapshot for the given aggregate.
     *
     * <p>Queries {@code SNAP#} sort-key prefix in reverse order and returns
     * the first (most recent) item. Returns {@link Optional#empty()} if no
     * snapshot exists or if reading fails.
     *
     * @param aggregateType e.g. "EXECUTION"
     * @param aggregateId   the aggregate identifier
     * @return the latest snapshot, or empty
     */
    public Optional<AggregateSnapshot> loadLatestSnapshot(String aggregateType, String aggregateId) {
        String pk = aggregateType.toUpperCase() + "#" + aggregateId;

        try {
            QueryRequest request = QueryRequest.builder()
                    .tableName(tableName)
                    .keyConditionExpression("PK = :pk AND begins_with(SK, :prefix)")
                    .expressionAttributeValues(Map.of(
                            ":pk", AttributeValue.fromS(pk),
                            ":prefix", AttributeValue.fromS(SNAP_SK_PREFIX)
                    ))
                    .scanIndexForward(false)   // descending — latest snapshot first
                    .limit(1)                  // we only need the most recent
                    .build();

            QueryResponse response = dynamoDbClient.query(request);

            if (response.items().isEmpty()) {
                log.debug("[SnapshotStore] MISS aggregateType={} aggregateId={}", aggregateType, aggregateId);
                return Optional.empty();
            }

            AggregateSnapshot snapshot = mapToSnapshot(response.items().get(0), aggregateType, aggregateId);
            log.info("[SnapshotStore] HIT aggregateType={} aggregateId={} atSequence={}",
                    aggregateType, aggregateId, snapshot.atSequence());
            return Optional.of(snapshot);

        } catch (Exception e) {
            log.warn("[SnapshotStore] Failed to load snapshot for {}#{}: {} — falling back to full stream",
                    aggregateType, aggregateId, e.getMessage());
            return Optional.empty();
        }
    }

    // ── Write ─────────────────────────────────────────────────────────────

    /**
     * Persists a snapshot for an aggregate.
     *
     * <p>Uses a conditional write: the snapshot is only written if no snapshot
     * at a higher or equal sequence already exists. This is safe under concurrent
     * snapshot-trigger invocations.
     *
     * @param aggregateType e.g. "EXECUTION"
     * @param aggregateId   the aggregate identifier
     * @param tenantId      the owning tenant
     * @param atSequence    the event sequence this snapshot represents
     * @param stateJson     the serialized aggregate state
     * @return true if the snapshot was written, false if a newer snapshot already exists
     */
    public boolean saveSnapshot(
            String aggregateType, String aggregateId, String tenantId, int atSequence, String stateJson) {

        String pk = aggregateType.toUpperCase() + "#" + aggregateId;
        String sk = SNAP_SK_PREFIX + String.format("%010d", atSequence);

        try {
            PutItemRequest request = PutItemRequest.builder()
                    .tableName(tableName)
                    .item(Map.of(
                            "PK", AttributeValue.fromS(pk),
                            "SK", AttributeValue.fromS(sk),
                            "aggregateId", AttributeValue.fromS(aggregateId),
                            "aggregateType", AttributeValue.fromS(aggregateType.toUpperCase()),
                            "tenantId", AttributeValue.fromS(tenantId),
                            "atSequence", AttributeValue.fromN(String.valueOf(atSequence)),
                            "stateJson", AttributeValue.fromS(stateJson),
                            "createdAt", AttributeValue.fromS(Instant.now().toString()),
                            "itemType", AttributeValue.fromS("SNAPSHOT")
                    ))
                    // Only write if this sequence is higher than any existing snapshot
                    .conditionExpression("attribute_not_exists(PK) OR atSequence < :seq")
                    .expressionAttributeValues(Map.of(
                            ":seq", AttributeValue.fromN(String.valueOf(atSequence))
                    ))
                    .build();

            dynamoDbClient.putItem(request);
            log.info("[SnapshotStore] SAVED aggregateType={} aggregateId={} atSequence={}",
                    aggregateType, aggregateId, atSequence);
            return true;

        } catch (ConditionalCheckFailedException e) {
            log.debug("[SnapshotStore] Snapshot skipped (newer exists) for {}#{} atSequence={}",
                    aggregateType, aggregateId, atSequence);
            return false;
        } catch (Exception e) {
            log.error("[SnapshotStore] Failed to save snapshot for {}#{}: {}",
                    aggregateType, aggregateId, e.getMessage(), e);
            return false;
        }
    }

    // ── Private ──────────────────────────────────────────────────────────

    private AggregateSnapshot mapToSnapshot(
            Map<String, AttributeValue> item, String aggregateType, String aggregateId) {

        String tenantId = item.containsKey("tenantId") ? item.get("tenantId").s() : "";
        int atSequence  = item.containsKey("atSequence") ? Integer.parseInt(item.get("atSequence").n()) : 0;
        String stateJson = item.containsKey("stateJson") ? item.get("stateJson").s() : "{}";
        Instant createdAt = item.containsKey("createdAt")
                ? Instant.parse(item.get("createdAt").s()) : Instant.now();

        return new AggregateSnapshot(aggregateId, aggregateType, tenantId, atSequence, stateJson, createdAt);
    }
}
