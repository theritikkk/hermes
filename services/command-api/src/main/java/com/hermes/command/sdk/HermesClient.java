package com.hermes.command.sdk;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Java SDK client for the Hermes Workflow Platform.
 *
 * <p>Provides a typed, synchronous interface to the Hermes Command API
 * and Replay Service. Uses Java 21's built-in {@link HttpClient} — zero
 * additional dependencies beyond the JDK.
 *
 * <p>Authentication: each request carries a Cognito Bearer token supplied
 * at construction time. In production, tokens should be refreshed externally
 * (e.g. via Cognito STS) and a new client instance built per token lifetime.
 *
 * @example
 * <pre>{@code
 * var client = HermesClient.builder()
 *     .commandApiUrl("https://api.hermes.internal/command")
 *     .replayApiUrl("https://api.hermes.internal/replay")
 *     .tenantId("tenant-acme")
 *     .accessToken(cognitoToken)
 *     .build();
 *
 * var response = client.startExecution(StartExecutionRequest.builder()
 *     .workflowName("document-pipeline")
 *     .workflowVersion(2)
 *     .assetId("asset-001")
 *     .idempotencyKey("batch-2026-08")
 *     .build());
 * }</pre>
 */
public class HermesClient {

    private static final Logger log = LoggerFactory.getLogger(HermesClient.class);

    private final String commandApiUrl;
    private final String replayApiUrl;
    private final String tenantId;
    private final String accessToken;
    private final HttpClient http;
    private final Duration timeout;

    // ── Builder ───────────────────────────────────────────────────────────

    private HermesClient(Builder builder) {
        this.commandApiUrl = requireNonBlank(builder.commandApiUrl, "commandApiUrl");
        this.replayApiUrl  = requireNonBlank(builder.replayApiUrl, "replayApiUrl");
        this.tenantId      = requireNonBlank(builder.tenantId, "tenantId");
        this.accessToken   = requireNonBlank(builder.accessToken, "accessToken");
        this.timeout       = builder.timeout != null ? builder.timeout : Duration.ofSeconds(30);
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String commandApiUrl;
        private String replayApiUrl;
        private String tenantId;
        private String accessToken;
        private Duration timeout;

        public Builder commandApiUrl(String url)  { this.commandApiUrl = url; return this; }
        public Builder replayApiUrl(String url)   { this.replayApiUrl = url; return this; }
        public Builder tenantId(String id)        { this.tenantId = id; return this; }
        public Builder accessToken(String token)  { this.accessToken = token; return this; }
        public Builder timeout(Duration duration) { this.timeout = duration; return this; }
        public HermesClient build()               { return new HermesClient(this); }
    }

    // ── Request / Response types ──────────────────────────────────────────

    public record StartExecutionRequest(
            String workflowName,
            int workflowVersion,
            String assetId,
            String idempotencyKey,
            Map<String, Object> metadata
    ) {
        public static Builder builder() { return new Builder(); }

        public static class Builder {
            private String workflowName;
            private int workflowVersion = 1;
            private String assetId;
            private String idempotencyKey;
            private Map<String, Object> metadata = Map.of();

            public Builder workflowName(String n) { this.workflowName = n; return this; }
            public Builder workflowVersion(int v) { this.workflowVersion = v; return this; }
            public Builder assetId(String id)     { this.assetId = id; return this; }
            public Builder idempotencyKey(String k) { this.idempotencyKey = k; return this; }
            public Builder metadata(Map<String, Object> m) { this.metadata = m; return this; }
            public StartExecutionRequest build() {
                return new StartExecutionRequest(workflowName, workflowVersion, assetId, idempotencyKey, metadata);
            }
        }
    }

    public record StartExecutionResponse(
            String executionId,
            String tenantId,
            String workflowName,
            int workflowVersion,
            String status,
            String message
    ) {}

    public record ReplayRequest(
            String executionId,
            String fromStep,
            Integer replayToSequence,
            String replayToTimestamp,
            boolean skipCompletedSteps,
            String reason
    ) {}

    public record ReplayResponse(
            String replayJobId,
            String executionId,
            String status,
            int eventsReplayed,
            int stepsSkipped,
            String message
    ) {}

    public record ExecutionStatusResponse(
            String executionId,
            String tenantId,
            String status,
            String workflowName,
            int workflowVersion,
            String startedAt,
            String completedAt
    ) {}

    // ── API methods ───────────────────────────────────────────────────────

    /**
     * Submits an asset for workflow execution.
     *
     * @param request execution parameters
     * @return the created execution record
     * @throws HermesClientException on non-2xx response or I/O error
     */
    public StartExecutionResponse startExecution(StartExecutionRequest request) {
        String body = toJson(Map.of(
                "workflowName", request.workflowName(),
                "workflowVersion", request.workflowVersion(),
                "assetId", request.assetId(),
                "tenantId", tenantId,
                "idempotencyKey", request.idempotencyKey() != null ? request.idempotencyKey() : "",
                "metadata", request.metadata()
        ));

        String responseBody = post(commandApiUrl + "/executions", body);
        log.info("[HermesClient] startExecution response: {}", responseBody);
        return parseStartExecutionResponse(responseBody);
    }

    /**
     * Retrieves the current status of an execution.
     *
     * @param executionId the execution to query
     * @return the current status record
     */
    public ExecutionStatusResponse getExecutionStatus(String executionId) {
        String responseBody = get(commandApiUrl + "/executions/" + executionId);
        return parseExecutionStatusResponse(responseBody);
    }

    /**
     * Triggers a replay of a past execution.
     *
     * @param request replay parameters (executionId, mode, reason)
     * @return the replay job result
     */
    public ReplayResponse replayExecution(ReplayRequest request) {
        String body = toJson(Map.of(
                "executionId", request.executionId(),
                "fromStep", request.fromStep() != null ? request.fromStep() : "",
                "skipCompletedSteps", request.skipCompletedSteps(),
                "reason", request.reason()
        ));

        String responseBody = post(replayApiUrl + "/replay", body);
        return parseReplayResponse(responseBody);
    }

    // ── HTTP internals ────────────────────────────────────────────────────

    private String post(String url, String body) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(timeout)
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + accessToken)
                    .header("X-Tenant-ID", tenantId)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = http.send(req, HttpResponse.BodyHandlers.ofString());
            assertSuccessful(response, url);
            return response.body();
        } catch (HermesClientException e) {
            throw e;
        } catch (Exception e) {
            throw new HermesClientException("POST " + url + " failed: " + e.getMessage(), e);
        }
    }

    private String get(String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(timeout)
                    .header("Authorization", "Bearer " + accessToken)
                    .header("X-Tenant-ID", tenantId)
                    .GET()
                    .build();

            HttpResponse<String> response = http.send(req, HttpResponse.BodyHandlers.ofString());
            assertSuccessful(response, url);
            return response.body();
        } catch (HermesClientException e) {
            throw e;
        } catch (Exception e) {
            throw new HermesClientException("GET " + url + " failed: " + e.getMessage(), e);
        }
    }

    private void assertSuccessful(HttpResponse<String> response, String url) {
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new HermesClientException(
                    "HTTP " + response.statusCode() + " from " + url + ": " + response.body(),
                    response.statusCode());
        }
    }

    // ── Minimal JSON helpers (no Jackson dependency) ───────────────────────

    private String toJson(Map<String, Object> map) {
        var sb = new StringBuilder("{");
        boolean first = true;
        for (var entry : map.entrySet()) {
            if (!first) sb.append(",");
            sb.append("\"").append(entry.getKey()).append("\":");
            Object val = entry.getValue();
            if (val instanceof String s) {
                sb.append("\"").append(escapeJson(s)).append("\"");
            } else if (val instanceof Boolean || val instanceof Number) {
                sb.append(val);
            } else if (val instanceof Map<?, ?> m) {
                sb.append(toJson((Map<String, Object>) m));
            } else {
                sb.append("\"").append(escapeJson(String.valueOf(val))).append("\"");
            }
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }

    private String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    /**
     * Minimal response parsers — in production these would use Jackson.
     * They extract only the fields we need from the JSON string.
     */
    private StartExecutionResponse parseStartExecutionResponse(String json) {
        return new StartExecutionResponse(
                extractString(json, "executionId"),
                extractString(json, "tenantId"),
                extractString(json, "workflowName"),
                extractInt(json, "workflowVersion"),
                extractString(json, "status"),
                extractString(json, "message")
        );
    }

    private ExecutionStatusResponse parseExecutionStatusResponse(String json) {
        return new ExecutionStatusResponse(
                extractString(json, "executionId"),
                extractString(json, "tenantId"),
                extractString(json, "status"),
                extractString(json, "workflowName"),
                extractInt(json, "workflowVersion"),
                extractString(json, "startedAt"),
                extractString(json, "completedAt")
        );
    }

    private ReplayResponse parseReplayResponse(String json) {
        return new ReplayResponse(
                extractString(json, "replayJobId"),
                extractString(json, "executionId"),
                extractString(json, "status"),
                extractInt(json, "eventsReplayed"),
                extractInt(json, "stepsSkipped"),
                extractString(json, "message")
        );
    }

    private String extractString(String json, String key) {
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start < 0) return "";
        start += search.length();
        int end = json.indexOf("\"", start);
        return end < 0 ? "" : json.substring(start, end);
    }

    private int extractInt(String json, String key) {
        String search = "\"" + key + "\":";
        int start = json.indexOf(search);
        if (start < 0) return 0;
        start += search.length();
        int end = start;
        while (end < json.length() && (Character.isDigit(json.charAt(end)) || json.charAt(end) == '-')) end++;
        try {
            return Integer.parseInt(json, start, end, 10);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String requireNonBlank(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("HermesClient: " + fieldName + " must not be blank");
        }
        return value;
    }

    // ── Exception ─────────────────────────────────────────────────────────

    public static class HermesClientException extends RuntimeException {
        private final int statusCode;

        public HermesClientException(String message, Throwable cause) {
            super(message, cause);
            this.statusCode = -1;
        }

        public HermesClientException(String message, int statusCode) {
            super(message);
            this.statusCode = statusCode;
        }

        public int getStatusCode() { return statusCode; }
    }
}
