package com.hermes.command.infrastructure.publishing;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hermes.command.domain.event.EventEnvelope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.eventbridge.EventBridgeClient;
import software.amazon.awssdk.services.eventbridge.model.PutEventsRequest;
import software.amazon.awssdk.services.eventbridge.model.PutEventsRequestEntry;
import software.amazon.awssdk.services.eventbridge.model.PutEventsResponse;

import java.util.List;
import java.util.stream.Collectors;

/**
 * AWS EventBridge implementation for EventPublisher.
 */
@Component
public class EventBridgeEventPublisher implements EventPublisher {

    private static final Logger log = LoggerFactory.getLogger(EventBridgeEventPublisher.class);
    
    private final EventBridgeClient eventBridgeClient;
    private final String eventBusName;
    private final ObjectMapper objectMapper;

    public EventBridgeEventPublisher(
            EventBridgeClient eventBridgeClient,
            @Value("${hermes.event-bus.name}") String eventBusName,
            ObjectMapper objectMapper) {
        this.eventBridgeClient = eventBridgeClient;
        this.eventBusName = eventBusName;
        this.objectMapper = objectMapper;
    }

    @Override
    public void publish(List<EventEnvelope> events) {
        if (events == null || events.isEmpty()) {
            return;
        }

        List<PutEventsRequestEntry> entries = events.stream()
                .map(this::createEventEntry)
                .collect(Collectors.toList());

        PutEventsRequest request = PutEventsRequest.builder()
                .entries(entries)
                .build();

        PutEventsResponse response = eventBridgeClient.putEvents(request);
        
        if (response.failedEntryCount() > 0) {
            log.error("Failed to publish {} events to EventBridge", response.failedEntryCount());
            // Depending on reliability requirements, we could throw an exception or handle it
            // For now, logging the error
        }
    }

    private PutEventsRequestEntry createEventEntry(EventEnvelope event) {
        try {
            return PutEventsRequestEntry.builder()
                    .eventBusName(eventBusName)
                    .source("hermes.command-api")
                    .detailType(event.eventType().name())
                    .detail(objectMapper.writeValueAsString(event))
                    .build();
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize event payload for EventBridge", e);
        }
    }
}
