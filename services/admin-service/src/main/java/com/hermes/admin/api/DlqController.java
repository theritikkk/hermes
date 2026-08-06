package com.hermes.admin.api;

import com.hermes.command.application.DlqInspectionService;
import com.hermes.command.domain.dlq.DlqMessage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Operator API for inspecting and managing the Hermes Dead-Letter Queue.
 *
 * <p>All endpoints require the {@code ADMIN} role enforced via Spring Security
 * and Cognito group claims. DLQ operations are audited via structured logs
 * in {@link DlqInspectionService}.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>{@code GET  /api/v1/dlq}                   — list messages (non-consuming peek)</li>
 *   <li>{@code GET  /api/v1/dlq/depth}              — get approximate queue depth</li>
 *   <li>{@code POST /api/v1/dlq/{messageId}/redrive}— move message back to source queue</li>
 *   <li>{@code DELETE /api/v1/dlq/{messageId}}      — discard poison message with audit</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/dlq")
@Tag(name = "DLQ Operations", description = "Operator API for dead-letter queue inspection and management")
public class DlqController {

    private static final Logger log = LoggerFactory.getLogger(DlqController.class);

    private final DlqInspectionService dlqService;

    public DlqController(DlqInspectionService dlqService) {
        this.dlqService = dlqService;
    }

    // ── List ──────────────────────────────────────────────────────────────

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List DLQ messages",
            description = "Returns up to maxMessages DLQ items without consuming them (peek mode). " +
                          "Poison messages (receiveCount >= 5) are flagged in the response.")
    public ResponseEntity<DlqListResponse> listMessages(
            @RequestParam(defaultValue = "20") int maxMessages) {

        List<DlqMessage> messages = dlqService.listDlqMessages(Math.min(maxMessages, 100));
        int poisonCount = (int) messages.stream().filter(DlqMessage::isPoisonMessage).count();

        log.info("[DlqController] GET /dlq — returned {} messages ({} poison)", messages.size(), poisonCount);

        return ResponseEntity.ok(new DlqListResponse(messages, messages.size(), poisonCount));
    }

    @GetMapping("/depth")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Get DLQ depth",
            description = "Returns the approximate number of messages currently in the DLQ.")
    public ResponseEntity<Map<String, Object>> getDlqDepth() {
        int depth = dlqService.getDlqDepth();
        return ResponseEntity.ok(Map.of(
                "approximateDepth", depth,
                "status", depth == 0 ? "EMPTY" : depth >= 100 ? "CRITICAL" : "MESSAGES_PRESENT"
        ));
    }

    // ── Redrive ───────────────────────────────────────────────────────────

    @PostMapping("/{messageId}/redrive")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Redrive a DLQ message",
            description = "Moves a message back to the source queue for retry. " +
                          "For poison messages (receiveCount >= 5), confirm the underlying cause is fixed first.")
    public ResponseEntity<Map<String, Object>> redriveMessage(
            @PathVariable String messageId,
            @RequestBody RedriveRequest request,
            @RequestHeader("X-Operator-ID") String operatorId) {

        log.info("[DlqController] REDRIVE messageId={} operator={}", messageId, operatorId);

        String newMessageId = dlqService.redriveMessage(
                messageId, request.receiptHandle(), request.body(), operatorId);

        return ResponseEntity.ok(Map.of(
                "messageId", messageId,
                "newMessageId", newMessageId,
                "status", "REDRIVEN",
                "operator", operatorId
        ));
    }

    // ── Purge ─────────────────────────────────────────────────────────────

    @DeleteMapping("/{messageId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Discard a poison message",
            description = "Permanently deletes a DLQ message. This is irreversible. " +
                          "A structured audit record is written to CloudWatch Logs.")
    public ResponseEntity<Map<String, Object>> purgeMessage(
            @PathVariable String messageId,
            @RequestBody PurgeRequest request,
            @RequestHeader("X-Operator-ID") String operatorId) {

        log.warn("[DlqController] PURGE messageId={} operator={} reason=\"{}\"",
                messageId, operatorId, request.reason());

        dlqService.purgeMessage(
                messageId, request.receiptHandle(), request.originalEventId(),
                request.tenantId(), request.eventType(), operatorId, request.reason());

        return ResponseEntity.ok(Map.of(
                "messageId", messageId,
                "status", "PURGED",
                "operator", operatorId,
                "reason", request.reason()
        ));
    }

    // ── Request / Response DTOs ───────────────────────────────────────────

    public record DlqListResponse(
            List<DlqMessage> messages,
            int totalCount,
            int poisonCount
    ) {}

    public record RedriveRequest(
            String receiptHandle,
            String body
    ) {}

    public record PurgeRequest(
            String receiptHandle,
            String originalEventId,
            String tenantId,
            String eventType,
            String reason
    ) {}
}
