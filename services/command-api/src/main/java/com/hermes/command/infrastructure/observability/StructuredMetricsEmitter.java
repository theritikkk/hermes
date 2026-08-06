package com.hermes.command.infrastructure.observability;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * CloudWatch Embedded Metric Format (EMF) emitter.
 *
 * <p>Emits structured JSON logs formatted according to the AWS CloudWatch EMF specification.
 * CloudWatch automatically extracts custom metrics from stdout logs without requiring custom SDK metric calls or agents.
 */
@Component
public class StructuredMetricsEmitter {

    private static final Logger log = LoggerFactory.getLogger("CloudWatchEMF");
    private static final String NAMESPACE = "Hermes/Platform";

    private final ObjectMapper objectMapper;

    public StructuredMetricsEmitter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Records a command acceptance metric.
     */
    public void recordCommandAccepted(String tenantId, String commandType) {
        emitEMF(
                Map.of("TenantId", tenantId, "CommandType", commandType),
                Map.of("CommandAccepted", 1),
                Map.of("Count", "Count")
        );
    }

    /**
     * Records an event appended metric.
     */
    public void recordEventAppended(String tenantId, String eventType) {
        emitEMF(
                Map.of("TenantId", tenantId, "EventType", eventType),
                Map.of("EventAppended", 1),
                Map.of("Count", "Count")
        );
    }

    /**
     * Records a Saga compensation execution.
     */
    public void recordSagaCompensationTriggered(String tenantId, int stepCount) {
        emitEMF(
                Map.of("TenantId", tenantId),
                Map.of("SagaCompensationTriggered", 1, "CompensatedStepsCount", stepCount),
                Map.of("SagaCompensationTriggered", "Count", "CompensatedStepsCount", "Count")
        );
    }

    /**
     * Records replay job execution duration.
     */
    public void recordReplayJobDuration(String tenantId, long durationMs) {
        emitEMF(
                Map.of("TenantId", tenantId),
                Map.of("ReplayJobDurationMs", durationMs),
                Map.of("ReplayJobDurationMs", "Milliseconds")
        );
    }

    private void emitEMF(Map<String, String> dimensions, Map<String, Number> metrics, Map<String, String> metricUnits) {
        try {
            Map<String, Object> emf = new LinkedHashMap<>();
            emf.put("Timestamp", Instant.now().toEpochMilli());

            // Add dimensions as top-level JSON fields
            dimensions.forEach(emf::put);

            // Add metrics as top-level JSON fields
            metrics.forEach(emf::put);

            // Build _aws EMF metadata block
            List<String> dimensionNames = List.copyOf(dimensions.keySet());
            List<Map<String, String>> metricDefinitions = metrics.keySet().stream()
                    .map(name -> Map.of("Name", name, "Unit", metricUnits.getOrDefault(name, "None")))
                    .toList();

            Map<String, Object> awsMetadata = new LinkedHashMap<>();
            awsMetadata.put("Timestamp", Instant.now().toEpochMilli());
            awsMetadata.put("CloudWatchMetrics", List.of(Map.of(
                    "Namespace", NAMESPACE,
                    "Dimensions", List.of(dimensionNames),
                    "Metrics", metricDefinitions
            )));

            emf.put("_aws", awsMetadata);

            String json = objectMapper.writeValueAsString(emf);
            log.info(json);
        } catch (Exception e) {
            log.warn("[EMF] Failed to emit structured metric: {}", e.getMessage());
        }
    }
}
