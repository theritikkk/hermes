package com.hermes.command.infrastructure.eventstore;

import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.event.EventEnvelope;
import java.util.List;

/**
 * EventStore interface.
 */
public interface EventStore {
    AppendResult append(AppendEventInput input);
    List<EventEnvelope> loadStream(AggregateType type, String aggregateId);
    List<EventEnvelope> loadStreamFrom(AggregateType type, String aggregateId, int fromSequence);
}
