package com.hermes.replay.infrastructure.eventstore;

import java.time.Instant;
import java.util.Map;

/**
 * An immutable point-in-time snapshot of an aggregate's state.
 *
 * <p>Snapshots are stored in the DynamoDB event store table under
 * the key {@code SK = SNAP#<paddedVersion>} alongside regular event
 * items, keeping the aggregate's full history in a single table
 * without a secondary snapshot store.
 *
 * <p>When a snapshot is present, the event store reader starts loading
 * events from {@code atSequence + 1}, dramatically reducing DynamoDB
 * read capacity consumption for long-running executions.
 *
 * @param aggregateId    the aggregate this snapshot belongs to
 * @param aggregateType  e.g. "EXECUTION" or "EXEC"
 * @param tenantId       the owning tenant
 * @param atSequence     the event sequence number at which this snapshot was taken
 * @param stateJson      the full serialized aggregate state (JSON string)
 * @param createdAt      when the snapshot was written
 */
public record AggregateSnapshot(
        String aggregateId,
        String aggregateType,
        String tenantId,
        int atSequence,
        String stateJson,
        Instant createdAt
) {
    /**
     * Returns the DynamoDB sort key for this snapshot item.
     * Format: {@code SNAP#<10-digit zero-padded sequence>}
     */
    public String sk() {
        return "SNAP#" + String.format("%010d", atSequence);
    }

    /**
     * Returns the event sequence from which event loading should resume
     * after applying this snapshot — i.e., the first event NOT yet reflected.
     */
    public int resumeFromSequence() {
        return atSequence + 1;
    }
}
