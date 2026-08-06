package com.hermes.replay.domain;

import java.time.Instant;
import java.util.Map;

/**
 * Immutable representation of a persisted domain event read from the event store.
 * Used by EventStreamReader when replaying execution history.
 */
public record DomainEvent(
        String eventId,
        String eventType,
        String aggregateType,
        String aggregateId,
        String tenantId,
        String correlationId,
        Instant occurredAt,
        int sequence,
        Map<String, Object> payload
) {
}
