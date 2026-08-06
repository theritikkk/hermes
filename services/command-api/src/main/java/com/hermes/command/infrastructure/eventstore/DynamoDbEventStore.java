package com.hermes.command.infrastructure.eventstore;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.event.DomainEventType;
import com.hermes.command.domain.event.EventEnvelope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.time.Instant;
import java.util.*;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

/**
 * DynamoDB implementation of EventStore.
 */
@Repository
public class DynamoDbEventStore implements EventStore {

    private final DynamoDbClient dynamoDbClient;
    private final String tableName;
    private final ObjectMapper objectMapper;

    public DynamoDbEventStore(
            DynamoDbClient dynamoDbClient,
            @Value("${hermes.event-store.table-name}") String tableName,
            ObjectMapper objectMapper) {
        this.dynamoDbClient = dynamoDbClient;
        this.tableName = tableName;
        this.objectMapper = objectMapper;
    }

    @Override
    public AppendResult append(AppendEventInput input) {
        String pk = DynamoDbKeys.aggregatePk(input.aggregateType(), input.aggregateId());
        String eventId = UUID.randomUUID().toString();
        int newSequence = input.expectedVersion() + 1;
        String sk = DynamoDbKeys.eventSk(newSequence, eventId);
        Instant now = Instant.now();

        Map<String, AttributeValue> metaItem = new HashMap<>();
        metaItem.put("PK", AttributeValue.builder().s(pk).build());
        metaItem.put("SK", AttributeValue.builder().s(DynamoDbKeys.metaSk()).build());
        metaItem.put("version", AttributeValue.builder().n(String.valueOf(newSequence)).build());

        Map<String, AttributeValue> eventItem = new HashMap<>();
        eventItem.put("PK", AttributeValue.builder().s(pk).build());
        eventItem.put("SK", AttributeValue.builder().s(sk).build());
        eventItem.put("eventId", AttributeValue.builder().s(eventId).build());
        eventItem.put("eventType", AttributeValue.builder().s(input.eventType()).build());
        eventItem.put("eventVersion", AttributeValue.builder().n(String.valueOf(input.eventVersion())).build());
        eventItem.put("aggregateType", AttributeValue.builder().s(input.aggregateType().name()).build());
        eventItem.put("aggregateId", AttributeValue.builder().s(input.aggregateId()).build());
        eventItem.put("tenantId", AttributeValue.builder().s(input.tenantId()).build());
        eventItem.put("correlationId", AttributeValue.builder().s(input.correlationId()).build());
        eventItem.put("occurredAt", AttributeValue.builder().s(now.toString()).build());
        eventItem.put("sequence", AttributeValue.builder().n(String.valueOf(newSequence)).build());
        eventItem.put("outboxStatus", AttributeValue.builder().s("PENDING").build());
        
        try {
            eventItem.put("payload", AttributeValue.builder().s(objectMapper.writeValueAsString(input.payload())).build());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize payload", e);
        }

        Put metaPut = Put.builder()
                .tableName(tableName)
                .item(metaItem)
                .conditionExpression("attribute_not_exists(version) OR version = :expectedVersion")
                .expressionAttributeValues(Map.of(":expectedVersion", AttributeValue.builder().n(String.valueOf(input.expectedVersion())).build()))
                .build();

        Put eventPut = Put.builder()
                .tableName(tableName)
                .item(eventItem)
                .conditionExpression("attribute_not_exists(SK)")
                .build();

        try {
            dynamoDbClient.transactWriteItems(TransactWriteItemsRequest.builder()
                    .transactItems(
                            TransactWriteItem.builder().put(metaPut).build(),
                            TransactWriteItem.builder().put(eventPut).build()
                    )
                    .build());
        } catch (TransactionCanceledException e) {
            if (e.cancellationReasons().stream().anyMatch(reason -> "ConditionalCheckFailed".equals(reason.code()))) {
                throw new ConcurrencyException("Optimistic locking failed for aggregate: " + input.aggregateId());
            }
            throw e;
        }

        EventEnvelope event = new EventEnvelope(
                eventId,
                DomainEventType.valueOf(input.eventType()),
                input.eventVersion(),
                input.aggregateType().name(),
                input.aggregateId(),
                input.tenantId(),
                input.correlationId(),
                now,
                newSequence,
                input.payload(),
                null
        );

        return new AppendResult(event, false);
    }

    @Override
    public List<EventEnvelope> loadStream(AggregateType type, String aggregateId) {
        return loadStreamFrom(type, aggregateId, 0);
    }

    @Override
    public List<EventEnvelope> loadStreamFrom(AggregateType type, String aggregateId, int fromSequence) {
        String pk = DynamoDbKeys.aggregatePk(type, aggregateId);
        String startSk = String.format("EVT#%010d", fromSequence);

        QueryRequest query = QueryRequest.builder()
                .tableName(tableName)
                .keyConditionExpression("PK = :pk AND SK >= :sk")
                .expressionAttributeValues(Map.of(
                        ":pk", AttributeValue.builder().s(pk).build(),
                        ":sk", AttributeValue.builder().s(startSk).build()
                ))
                .scanIndexForward(true)
                .build();

        QueryResponse response = dynamoDbClient.query(query);

        return response.items().stream()
                .map(this::mapToEventEnvelope)
                .collect(Collectors.toList());
    }

    private EventEnvelope mapToEventEnvelope(Map<String, AttributeValue> item) {
        try {
            return new EventEnvelope(
                    item.get("eventId").s(),
                    DomainEventType.valueOf(item.get("eventType").s()),
                    Integer.parseInt(item.get("eventVersion").n()),
                    item.get("aggregateType").s(),
                    item.get("aggregateId").s(),
                    item.get("tenantId").s(),
                    item.get("correlationId") != null ? item.get("correlationId").s() : null,
                    Instant.parse(item.get("occurredAt").s()),
                    Integer.parseInt(item.get("sequence").n()),
                    objectMapper.readValue(item.get("payload").s(), new TypeReference<Map<String, Object>>() {}),
                    item.get("publishedAt") != null ? Instant.parse(item.get("publishedAt").s()) : null
            );
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize payload", e);
        }
    }

    public static <T> T replayAggregate(List<EventEnvelope> events, T initial, BiFunction<T, EventEnvelope, T> apply) {
        T state = initial;
        for (EventEnvelope event : events) {
            state = apply.apply(state, event);
        }
        return state;
    }
}
