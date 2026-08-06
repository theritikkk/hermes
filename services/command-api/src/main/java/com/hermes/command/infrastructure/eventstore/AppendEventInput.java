package com.hermes.command.infrastructure.eventstore;

import com.hermes.command.domain.aggregate.AggregateType;
import java.util.Map;

/**
 * Input for appending an event.
 */
public record AppendEventInput(
    AggregateType aggregateType,
    String aggregateId,
    String tenantId,
    String correlationId,
    String eventType,
    int eventVersion,
    Map<String, Object> payload,
    int expectedVersion
) {}
