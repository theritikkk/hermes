package com.hermes.admin.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/webhooks")
public class WebhookController {

    public record WebhookRegistration(
            String webhookId,
            String tenantId,
            String targetUrl,
            List<String> eventTypes,
            String secretKey,
            boolean active,
            Instant createdAt
    ) {}

    public record CreateWebhookRequest(
            String targetUrl,
            List<String> eventTypes
    ) {}

    private final Map<String, WebhookRegistration> webhooks = new HashMap<>();

    @PostMapping({"", "/"})
    public ResponseEntity<WebhookRegistration> registerWebhook(
            @RequestHeader(value = "X-Tenant-ID", defaultValue = "default-tenant") String tenantId,
            @RequestBody CreateWebhookRequest request) {

        String webhookId = "wh-" + UUID.randomUUID().toString();
        String secretKey = "whsec_" + UUID.randomUUID().toString().replace("-", "");

        WebhookRegistration reg = new WebhookRegistration(
                webhookId,
                tenantId,
                request.targetUrl(),
                request.eventTypes() != null ? request.eventTypes() : List.of("WORKFLOW_EXECUTION_COMPLETED", "WORKFLOW_EXECUTION_FAILED"),
                secretKey,
                true,
                Instant.now()
        );

        webhooks.put(webhookId, reg);
        return ResponseEntity.status(HttpStatus.CREATED).body(reg);
    }

    @GetMapping({"", "/"})
    public ResponseEntity<List<WebhookRegistration>> listWebhooks(
            @RequestHeader(value = "X-Tenant-ID", defaultValue = "default-tenant") String tenantId) {

        List<WebhookRegistration> result = webhooks.values().stream()
                .filter(w -> w.tenantId().equals(tenantId))
                .toList();

        return ResponseEntity.ok(result);
    }

    @DeleteMapping("/{webhookId}")
    public ResponseEntity<Void> deleteWebhook(@PathVariable String webhookId) {
        webhooks.remove(webhookId);
        return ResponseEntity.noContent().build();
    }
}
