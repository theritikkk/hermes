package com.hermes.command.domain.event;

import java.time.Instant;
import java.util.Map;

/**
 * Generic envelope for domain events.
 */
public record EventEnvelope(
    String eventId,
    DomainEventType eventType,
    int eventVersion,
    String aggregateType,
    String aggregateId,
    String tenantId,
    String correlationId,
    Instant occurredAt,
    int sequence,
    Map<String, Object> payload,
    Instant publishedAt
) {}
