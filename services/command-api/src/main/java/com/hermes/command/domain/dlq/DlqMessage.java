package com.hermes.command.domain.dlq;

import java.time.Instant;

/**
 * Represents a single message sitting in the Hermes Dead-Letter Queue (DLQ).
 *
 * <p>DLQ messages are events that failed processing (Lambda threw, or the
 * outbox-publisher could not publish to EventBridge) after exhausting all
 * SQS retry attempts (typically 5 visible delivery attempts over an
 * exponentially increasing backoff window).
 *
 * <p><b>Poison message detection</b>: A message is classified as a
 * <em>poison message</em> when {@code receiveCount >= POISON_THRESHOLD}.
 * Poison messages should NOT be redriven automatically — they need operator
 * inspection to determine whether they indicate a data issue, infrastructure
 * outage, or a schema incompatibility.
 *
 * @param messageId       SQS message ID (uniquely identifies the DLQ item)
 * @param receiptHandle   SQS receipt handle (required for delete/redrive operations)
 * @param tenantId        owning tenant, extracted from the message body
 * @param originalEventId the domain event ID that failed to process
 * @param eventType       e.g. "WorkflowExecutionStarted"
 * @param failureReason   last exception message or "Unknown" if unavailable
 * @param receiveCount    how many times this message has been received across all queues
 * @param firstFailedAt   approximate time the message first entered the DLQ
 * @param body            the raw message body (JSON string)
 */
public record DlqMessage(
        String messageId,
        String receiptHandle,
        String tenantId,
        String originalEventId,
        String eventType,
        String failureReason,
        int receiveCount,
        Instant firstFailedAt,
        String body
) {
    /** Number of receive attempts above which a message is considered poisoned. */
    public static final int POISON_THRESHOLD = 5;

    /**
     * Returns true if this message has been attempted enough times to be
     * considered a poison message. Poison messages require operator review
     * before redrive — automated redriving will likely cause the same failure.
     */
    public boolean isPoisonMessage() {
        return receiveCount >= POISON_THRESHOLD;
    }

    /**
     * Returns a human-readable severity label for operator dashboards.
     */
    public String severity() {
        if (receiveCount >= 10) return "CRITICAL";
        if (receiveCount >= POISON_THRESHOLD) return "HIGH";
        return "MEDIUM";
    }
}
