package com.hermes.command.application.handler;

import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class BatchAssetHandler {

    public record BatchItemRequest(
            String assetId,
            String workflowName,
            String s3Uri,
            Map<String, Object> metadata
    ) {}

    public record BatchRegistrationRequest(
            String batchId,
            List<BatchItemRequest> items
    ) {}

    public record BatchItemResult(
            String assetId,
            String executionId,
            String status
    ) {}

    public record BatchRegistrationResponse(
            String batchId,
            int totalSubmitted,
            int totalProcessed,
            List<BatchItemResult> items
    ) {}

    public BatchRegistrationResponse processBatch(String tenantId, BatchRegistrationRequest request) {
        String batchId = request.batchId() != null ? request.batchId() : "batch-" + UUID.randomUUID().toString();
        List<BatchItemResult> itemResults = new ArrayList<>();

        if (request.items() != null) {
            for (BatchItemRequest item : request.items()) {
                String executionId = "exec-" + UUID.randomUUID().toString();
                itemResults.add(new BatchItemResult(
                        item.assetId() != null ? item.assetId() : "asset-" + UUID.randomUUID().toString(),
                        executionId,
                        "QUEUED"
                ));
            }
        }

        return new BatchRegistrationResponse(
                batchId,
                request.items() != null ? request.items().size() : 0,
                itemResults.size(),
                itemResults
        );
    }
}
