package com.hermes.command.application;

import com.hermes.command.domain.dlq.DlqMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/**
 * Operator service for inspecting and managing the Hermes Dead-Letter Queue.
 *
 * <p><b>Design</b>: Uses SQS visibility timeout to implement safe peeking.
 * {@link #listDlqMessages} sets a zero-second visibility timeout (peek-mode),
 * meaning messages remain visible to other consumers. Only {@link #redriveMessage}
 * and {@link #purgeMessage} permanently modify the queue.
 *
 * <p><b>Redrive mechanics</b>: SQS does not have a native "move message" API
 * (prior to SQS Message Move, which requires a Lambda trigger). Instead, we
 * read the message body, send it to the source queue with a fresh
 * {@code messageDeduplicationId}, then delete it from the DLQ.
 * This gives us full control over retry metadata and idempotency.
 *
 * <p><b>Audit</b>: Every {@link #purgeMessage} call logs a structured audit
 * line with the messageId, tenantId, eventType, and operator identity.
 * These logs are captured by CloudWatch and contribute to the immutable
 * audit trail.
 *
 * <p><b>Safety</b>: Poison messages (receiveCount >= threshold) are flagged
 * in the response. The controller layer shows a warning before allowing
 * an operator to redrive them.
 */
@Service
public class DlqInspectionService {

    private static final Logger log = LoggerFactory.getLogger(DlqInspectionService.class);

    /** SQS receive batch size (maximum allowed by AWS). */
    private static final int RECEIVE_BATCH_SIZE = 10;

    /** Peek visibility: 0 seconds — messages remain immediately visible after listing. */
    private static final int PEEK_VISIBILITY_SECONDS = 0;

    private final SqsClient sqsClient;
    private final String dlqUrl;
    private final String sourceQueueUrl;

    public DlqInspectionService(
            SqsClient sqsClient,
            @Value("${hermes.dlq.url:}") String dlqUrl,
            @Value("${hermes.outbox.queue-url:}") String sourceQueueUrl) {
        this.sqsClient = sqsClient;
        this.dlqUrl = dlqUrl;
        this.sourceQueueUrl = sourceQueueUrl;
    }

    // ── Inspection ────────────────────────────────────────────────────────

    /**
     * Lists up to {@code maxMessages} DLQ messages without consuming them.
     * Uses visibility timeout = 0 so messages remain available to other readers.
     *
     * @param maxMessages maximum number of messages to retrieve (capped at 100)
     * @return list of DLQ messages with metadata and poison classification
     */
    public List<DlqMessage> listDlqMessages(int maxMessages) {
        int batches = Math.min((int) Math.ceil((double) maxMessages / RECEIVE_BATCH_SIZE), 10);
        List<DlqMessage> messages = new java.util.ArrayList<>();

        for (int i = 0; i < batches && messages.size() < maxMessages; i++) {
            ReceiveMessageResponse response = sqsClient.receiveMessage(
                    ReceiveMessageRequest.builder()
                            .queueUrl(dlqUrl)
                            .maxNumberOfMessages(RECEIVE_BATCH_SIZE)
                            .visibilityTimeout(PEEK_VISIBILITY_SECONDS)
                            .messageAttributeNames("All")
                            .attributeNames(QueueAttributeName.ALL)
                            .build()
            );

            if (response.messages().isEmpty()) break;

            response.messages().stream()
                    .map(this::mapToDlqMessage)
                    .forEach(messages::add);
        }

        log.info("[DlqInspection] Listed {} DLQ messages", messages.size());
        return messages;
    }

    /**
     * Returns the approximate number of messages currently in the DLQ.
     * Uses the {@code ApproximateNumberOfMessages} queue attribute — may lag
     * by a few seconds under high throughput.
     */
    public int getDlqDepth() {
        GetQueueAttributesResponse response = sqsClient.getQueueAttributes(
                GetQueueAttributesRequest.builder()
                        .queueUrl(dlqUrl)
                        .attributeNames(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES)
                        .build()
        );

        String depth = response.attributes()
                .getOrDefault(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES, "0");
        return Integer.parseInt(depth);
    }

    // ── Redrive ───────────────────────────────────────────────────────────

    /**
     * Redrives a DLQ message back to the source queue for retry.
     *
     * <p>Sends the original message body to the source queue with a new
     * message deduplication ID, then deletes it from the DLQ. If the send
     * fails, the DLQ message is NOT deleted — the operator must try again.
     *
     * @param messageId     the SQS message ID to redrive
     * @param receiptHandle the SQS receipt handle (must be current — re-list if expired)
     * @param operatorId    the operator initiating the redrive (for audit)
     * @return the new SQS message ID in the source queue
     * @throws NoSuchElementException if the receipt handle is invalid/expired
     */
    public String redriveMessage(String messageId, String receiptHandle, String body, String operatorId) {
        log.info("[DlqInspection] REDRIVE messageId={} by operator={}", messageId, operatorId);

        // Send to source queue
        SendMessageResponse sendResponse = sqsClient.sendMessage(
                SendMessageRequest.builder()
                        .queueUrl(sourceQueueUrl)
                        .messageBody(body)
                        .messageDeduplicationId("redrive-" + messageId + "-" + System.currentTimeMillis())
                        .messageGroupId("hermes-redrive")
                        .build()
        );

        // Only delete from DLQ after successful send
        sqsClient.deleteMessage(
                DeleteMessageRequest.builder()
                        .queueUrl(dlqUrl)
                        .receiptHandle(receiptHandle)
                        .build()
        );

        log.info("[DlqInspection] REDRIVE_COMPLETE messageId={} newMessageId={} operator={}",
                messageId, sendResponse.messageId(), operatorId);

        return sendResponse.messageId();
    }

    // ── Purge (poison message discard) ───────────────────────────────────

    /**
     * Permanently discards a DLQ message.
     *
     * <p>This is an irreversible operation. It should only be used for
     * confirmed poison messages where re-processing would cause data corruption
     * or where the underlying cause has been fixed and the event is stale.
     *
     * <p>Emits a structured audit log line that is captured by CloudWatch Logs
     * and contributes to the immutable operator audit trail.
     *
     * @param messageId     the SQS message ID to discard
     * @param receiptHandle the SQS receipt handle
     * @param originalEventId the domain event ID (for audit)
     * @param tenantId      the owning tenant (for audit)
     * @param eventType     the event type (for audit)
     * @param operatorId    the operator performing the discard (for audit)
     * @param reason        the operator's stated reason for discarding
     */
    public void purgeMessage(
            String messageId, String receiptHandle, String originalEventId,
            String tenantId, String eventType, String operatorId, String reason) {

        // Structured audit log — captured by CloudWatch Logs and contributes to immutable audit trail
        log.warn("[DlqInspection] POISON_MESSAGE_DISCARDED messageId={} originalEventId={} " +
                        "tenantId={} eventType={} operator={} reason=\"{}\"",
                messageId, originalEventId, tenantId, eventType, operatorId, reason);

        sqsClient.deleteMessage(
                DeleteMessageRequest.builder()
                        .queueUrl(dlqUrl)
                        .receiptHandle(receiptHandle)
                        .build()
        );

        log.info("[DlqInspection] PURGE_COMPLETE messageId={}", messageId);
    }

    // ── Private ──────────────────────────────────────────────────────────

    private DlqMessage mapToDlqMessage(Message msg) {
        Map<String, MessageAttributeValue> attrs = msg.messageAttributes();

        String tenantId = attrString(attrs, "tenantId");
        String originalEventId = attrString(attrs, "originalEventId");
        String eventType = attrString(attrs, "eventType");
        String failureReason = attrString(attrs, "failureReason");

        // SQS ApproximateReceiveCount is a system attribute (not message attribute)
        int receiveCount = 1;
        Map<String, String> systemAttrs = msg.attributesAsStrings();
        if (systemAttrs.containsKey("ApproximateReceiveCount")) {
            try { receiveCount = Integer.parseInt(systemAttrs.get("ApproximateReceiveCount")); }
            catch (NumberFormatException ignored) {}
        }

        Instant firstFailedAt = Instant.now();
        if (systemAttrs.containsKey("SentTimestamp")) {
            try { firstFailedAt = Instant.ofEpochMilli(Long.parseLong(systemAttrs.get("SentTimestamp"))); }
            catch (NumberFormatException ignored) {}
        }

        return new DlqMessage(
                msg.messageId(), msg.receiptHandle(),
                tenantId.isBlank() ? "unknown" : tenantId,
                originalEventId.isBlank() ? "unknown" : originalEventId,
                eventType.isBlank() ? "unknown" : eventType,
                failureReason.isBlank() ? "Unknown" : failureReason,
                receiveCount,
                firstFailedAt,
                msg.body()
        );
    }

    private String attrString(Map<String, MessageAttributeValue> attrs, String key) {
        MessageAttributeValue val = attrs.get(key);
        return val != null ? val.stringValue() : "";
    }
}
