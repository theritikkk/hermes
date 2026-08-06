package com.hermes.command.infrastructure.idempotency;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hermes.command.domain.TenantId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * DynamoDB implementation for IdempotencyStore.
 */
@Repository
public class DynamoDbIdempotencyStore implements IdempotencyStore {

    private final DynamoDbClient dynamoDbClient;
    private final String tableName;
    private final ObjectMapper objectMapper;

    public DynamoDbIdempotencyStore(
            DynamoDbClient dynamoDbClient,
            @Value("${hermes.idempotency.table-name}") String tableName,
            ObjectMapper objectMapper) {
        this.dynamoDbClient = dynamoDbClient;
        this.tableName = tableName;
        this.objectMapper = objectMapper;
    }

    private String getPk(String tenantId, String clientRequestId) {
        return "IDEM#" + tenantId + "#" + clientRequestId;
    }

    @Override
    public Optional<IdempotencyRecord> find(TenantId tenantId, String clientRequestId) {
        String pk = getPk(tenantId.value(), clientRequestId);

        GetItemRequest request = GetItemRequest.builder()
                .tableName(tableName)
                .key(Map.of(
                        "PK", AttributeValue.builder().s(pk).build(),
                        "SK", AttributeValue.builder().s("IDEM").build()
                ))
                .build();

        GetItemResponse response = dynamoDbClient.getItem(request);
        if (!response.hasItem()) {
            return Optional.empty();
        }

        Map<String, AttributeValue> item = response.item();
        try {
            Object responseBody = null;
            if (item.containsKey("responseBody") && item.get("responseBody").s() != null) {
                responseBody = objectMapper.readValue(item.get("responseBody").s(), Object.class);
            }

            return Optional.of(new IdempotencyRecord(
                    clientRequestId,
                    tenantId.value(),
                    item.get("commandType").s(),
                    item.get("aggregateId") != null ? item.get("aggregateId").s() : null,
                    item.get("status").s(),
                    responseBody,
                    Instant.parse(item.get("createdAt").s()),
                    Instant.ofEpochSecond(Long.parseLong(item.get("expiresAt").n()))
            ));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize response body", e);
        }
    }

    @Override
    public boolean reserve(IdempotencyRecord record) {
        String pk = getPk(record.tenantId(), record.clientRequestId());

        Map<String, AttributeValue> item = new HashMap<>();
        item.put("PK", AttributeValue.builder().s(pk).build());
        item.put("SK", AttributeValue.builder().s("IDEM").build());
        item.put("clientRequestId", AttributeValue.builder().s(record.clientRequestId()).build());
        item.put("tenantId", AttributeValue.builder().s(record.tenantId()).build());
        item.put("commandType", AttributeValue.builder().s(record.commandType()).build());
        if (record.aggregateId() != null) {
            item.put("aggregateId", AttributeValue.builder().s(record.aggregateId()).build());
        }
        item.put("status", AttributeValue.builder().s(record.status()).build());
        item.put("createdAt", AttributeValue.builder().s(record.createdAt().toString()).build());
        item.put("expiresAt", AttributeValue.builder().n(String.valueOf(record.expiresAt().getEpochSecond())).build());

        PutItemRequest request = PutItemRequest.builder()
                .tableName(tableName)
                .item(item)
                .conditionExpression("attribute_not_exists(PK)")
                .build();

        try {
            dynamoDbClient.putItem(request);
            return true;
        } catch (ConditionalCheckFailedException e) {
            return false;
        }
    }

    @Override
    public void complete(TenantId tenantId, String clientRequestId, Object responseBody) {
        String pk = getPk(tenantId.value(), clientRequestId);

        try {
            String responseBodyJson = objectMapper.writeValueAsString(responseBody);
            
            Map<String, AttributeValueUpdate> updates = new HashMap<>();
            updates.put("status", AttributeValueUpdate.builder()
                    .value(AttributeValue.builder().s("COMPLETED").build())
                    .action(AttributeAction.PUT)
                    .build());
            updates.put("responseBody", AttributeValueUpdate.builder()
                    .value(AttributeValue.builder().s(responseBodyJson).build())
                    .action(AttributeAction.PUT)
                    .build());

            UpdateItemRequest request = UpdateItemRequest.builder()
                    .tableName(tableName)
                    .key(Map.of(
                            "PK", AttributeValue.builder().s(pk).build(),
                            "SK", AttributeValue.builder().s("IDEM").build()
                    ))
                    .attributeUpdates(updates)
                    .build();

            dynamoDbClient.updateItem(request);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize response body", e);
        }
    }
}
