package com.hermes.command.infrastructure.eventstore;

import com.hermes.command.domain.event.EventEnvelope;

/**
 * Result of appending an event.
 */
public record AppendResult(
    EventEnvelope event,
    boolean wasIdempotent
) {}
