package com.hermes.query.infrastructure.readmodel;

import com.hermes.query.application.query.ListExecutionsQuery;
import com.hermes.query.domain.ExecutionProjection;
import com.hermes.query.domain.ExecutionStatus;
import com.hermes.query.domain.StepProjection;
import com.hermes.query.domain.TenantId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.util.*;

@Repository
public class DynamoDbExecutionReadModel implements ExecutionReadModel {

    private final DynamoDbClient dynamoDbClient;
    private final String tableName;

    public DynamoDbExecutionReadModel(
            DynamoDbClient dynamoDbClient,
            @Value("${hermes.read-model.table-name}") String tableName) {
        this.dynamoDbClient = dynamoDbClient;
        this.tableName = tableName;
    }

    @Override
    public Optional<ExecutionProjection> findById(TenantId tenantId, String executionId) {
        String pk = "TENANT#" + tenantId.value();
        String sk = "EXEC#" + executionId;

        GetItemRequest request = GetItemRequest.builder()
                .tableName(tableName)
                .key(Map.of(
                        "PK", AttributeValue.builder().s(pk).build(),
                        "SK", AttributeValue.builder().s(sk).build()
                ))
                .build();

        GetItemResponse response = dynamoDbClient.getItem(request);
        if (!response.hasItem() || response.item().isEmpty()) {
            return Optional.empty();
        }

        ExecutionProjection projection = mapToProjection(response.item(), executionId);
        if (!tenantId.value().equals(projection.tenantId())) {
            throw new AccessDeniedException("Access denied to execution: " + executionId);
        }

        return Optional.of(projection);
    }

    @Override
    public ListResult<ExecutionProjection> findByTenant(TenantId tenantId, ListExecutionsQuery query) {
        String pk = "TENANT#" + tenantId.value();

        QueryRequest.Builder builder = QueryRequest.builder()
                .tableName(tableName)
                .keyConditionExpression("PK = :pk AND begins_with(SK, :skPrefix)")
                .expressionAttributeValues(Map.of(
                        ":pk", AttributeValue.builder().s(pk).build(),
                        ":skPrefix", AttributeValue.builder().s("EXEC#").build()
                ))
                .limit(query.limit());

        if (query.status() != null) {
            builder.filterExpression("#status = :statusVal")
                    .expressionAttributeNames(Map.of("#status", "status"))
                    .expressionAttributeValues(Map.of(
                            ":pk", AttributeValue.builder().s(pk).build(),
                            ":skPrefix", AttributeValue.builder().s("EXEC#").build(),
                            ":statusVal", AttributeValue.builder().s(query.status().name()).build()
                    ));
        }

        if (query.nextPageToken() != null && !query.nextPageToken().isBlank()) {
            builder.exclusiveStartKey(Map.of(
                    "PK", AttributeValue.builder().s(pk).build(),
                    "SK", AttributeValue.builder().s("EXEC#" + query.nextPageToken()).build()
            ));
        }

        QueryResponse response = dynamoDbClient.query(builder.build());
        List<ExecutionProjection> items = new ArrayList<>();

        for (Map<String, AttributeValue> item : response.items()) {
            String execId = item.get("SK").s().substring(5);
            items.add(mapToProjection(item, execId));
        }

        String nextPageToken = null;
        if (response.hasLastEvaluatedKey() && response.lastEvaluatedKey().containsKey("SK")) {
            nextPageToken = response.lastEvaluatedKey().get("SK").s().substring(5);
        }

        return new ListResult<>(items, nextPageToken);
    }

    private ExecutionProjection mapToProjection(Map<String, AttributeValue> item, String fallbackExecutionId) {
        String tenantId = item.containsKey("tenantId") ? item.get("tenantId").s() : "";
        String wfName = item.containsKey("workflowName") ? item.get("workflowName").s() : "";
        Integer wfVer = item.containsKey("workflowVersion") ? Integer.parseInt(item.get("workflowVersion").n()) : 1;
        String assetId = item.containsKey("assetId") ? item.get("assetId").s() : null;
        String s3Key = item.containsKey("s3Key") ? item.get("s3Key").s() : null;
        ExecutionStatus status = item.containsKey("status") ? ExecutionStatus.valueOf(item.get("status").s()) : ExecutionStatus.PENDING;
        String startedAt = item.containsKey("startedAt") ? item.get("startedAt").s() : null;
        String completedAt = item.containsKey("completedAt") ? item.get("completedAt").s() : null;
        String failureReason = item.containsKey("failureReason") ? item.get("failureReason").s() : null;
        String updatedAt = item.containsKey("updatedAt") ? item.get("updatedAt").s() : null;

        Map<String, StepProjection> steps = new HashMap<>();
        if (item.containsKey("steps") && item.get("steps").hasM()) {
            Map<String, AttributeValue> stepMap = item.get("steps").m();
            for (Map.Entry<String, AttributeValue> entry : stepMap.entrySet()) {
                if (entry.getValue().hasM()) {
                    Map<String, AttributeValue> s = entry.getValue().m();
                    String stepStatus = s.containsKey("status") ? s.get("status").s() : "UNKNOWN";
                    String stepError = s.containsKey("error") ? s.get("error").s() : null;
                    String stepCompletedAt = s.containsKey("completedAt") ? s.get("completedAt").s() : null;
                    steps.put(entry.getKey(), new StepProjection(entry.getKey(), stepStatus, null, stepError, stepCompletedAt));
                }
            }
        }

        return new ExecutionProjection(
                fallbackExecutionId,
                tenantId,
                wfName,
                wfVer,
                assetId,
                s3Key,
                status,
                steps,
                startedAt,
                completedAt,
                failureReason,
                updatedAt
        );
    }
}
