package com.hermes.command.infrastructure.publishing;

import com.hermes.command.domain.event.EventEnvelope;
import java.util.List;

/**
 * Event publisher interface.
 */
public interface EventPublisher {
    void publish(List<EventEnvelope> events);
}
