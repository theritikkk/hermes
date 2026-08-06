package com.hermes.command.domain.dlq;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for DLQ domain model and poison message detection logic.
 *
 * <p>These tests deliberately don't mock SQS — they verify the pure domain
 * rules of what constitutes a poison message and how messages are classified.
 */
@DisplayName("DLQ Handler")
class DlqHandlerTest {

    private static final Instant NOW = Instant.parse("2026-08-06T10:00:00Z");

    private DlqMessage buildMessage(int receiveCount) {
        return new DlqMessage(
                "msg-" + receiveCount,
                "receipt-handle-abc",
                "tenant-acme",
                "evt-" + receiveCount,
                "WorkflowExecutionStarted",
                "Connection refused: DynamoDB",
                receiveCount,
                NOW,
                "{\"executionId\":\"exec-001\"}"
        );
    }

    // ── Poison detection ──────────────────────────────────────────────────

    @Nested
    @DisplayName("isPoisonMessage()")
    class PoisonDetectionTests {

        @Test
        @DisplayName("receiveCount < 5 is NOT a poison message")
        void testNotPoison_belowThreshold() {
            assertThat(buildMessage(1).isPoisonMessage()).isFalse();
            assertThat(buildMessage(3).isPoisonMessage()).isFalse();
            assertThat(buildMessage(4).isPoisonMessage()).isFalse();
        }

        @Test
        @DisplayName("receiveCount = 5 is exactly at poison threshold")
        void testPoison_atThreshold() {
            assertThat(buildMessage(5).isPoisonMessage()).isTrue();
        }

        @Test
        @DisplayName("receiveCount > 5 is always poison")
        void testPoison_aboveThreshold() {
            assertThat(buildMessage(6).isPoisonMessage()).isTrue();
            assertThat(buildMessage(50).isPoisonMessage()).isTrue();
        }

        @Test
        @DisplayName("receiveCount = 0 is never poison (edge case: fresh message)")
        void testNotPoison_receiveCountZero() {
            assertThat(buildMessage(0).isPoisonMessage()).isFalse();
        }
    }

    // ── Severity classification ───────────────────────────────────────────

    @Nested
    @DisplayName("severity()")
    class SeverityTests {

        @Test
        @DisplayName("receiveCount < 5 → MEDIUM severity")
        void testMediumSeverity() {
            assertThat(buildMessage(1).severity()).isEqualTo("MEDIUM");
            assertThat(buildMessage(4).severity()).isEqualTo("MEDIUM");
        }

        @Test
        @DisplayName("receiveCount 5-9 → HIGH severity")
        void testHighSeverity() {
            assertThat(buildMessage(5).severity()).isEqualTo("HIGH");
            assertThat(buildMessage(9).severity()).isEqualTo("HIGH");
        }

        @Test
        @DisplayName("receiveCount >= 10 → CRITICAL severity")
        void testCriticalSeverity() {
            assertThat(buildMessage(10).severity()).isEqualTo("CRITICAL");
            assertThat(buildMessage(100).severity()).isEqualTo("CRITICAL");
        }
    }

    // ── Record fields ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("DlqMessage fields")
    class FieldTests {

        @Test
        @DisplayName("All fields are stored correctly")
        void testFieldStorage() {
            var msg = buildMessage(3);
            assertThat(msg.messageId()).isEqualTo("msg-3");
            assertThat(msg.tenantId()).isEqualTo("tenant-acme");
            assertThat(msg.originalEventId()).isEqualTo("evt-3");
            assertThat(msg.eventType()).isEqualTo("WorkflowExecutionStarted");
            assertThat(msg.failureReason()).isEqualTo("Connection refused: DynamoDB");
            assertThat(msg.receiveCount()).isEqualTo(3);
            assertThat(msg.firstFailedAt()).isEqualTo(NOW);
            assertThat(msg.body()).contains("exec-001");
        }

        @Test
        @DisplayName("POISON_THRESHOLD constant is 5")
        void testPoisonThresholdConstant() {
            assertThat(DlqMessage.POISON_THRESHOLD).isEqualTo(5);
        }

        @Test
        @DisplayName("receiptHandle is preserved (required for SQS delete/redrive)")
        void testReceiptHandlePreserved() {
            var msg = buildMessage(1);
            assertThat(msg.receiptHandle()).isEqualTo("receipt-handle-abc");
        }
    }

    // ── Boundary conditions ───────────────────────────────────────────────

    @Nested
    @DisplayName("Boundary and edge cases")
    class BoundaryTests {

        @Test
        @DisplayName("Message at exactly threshold is poison but below CRITICAL")
        void testAtThreshold_poisonButNotCritical() {
            var msg = buildMessage(DlqMessage.POISON_THRESHOLD);
            assertThat(msg.isPoisonMessage()).isTrue();
            assertThat(msg.severity()).isEqualTo("HIGH");
        }

        @Test
        @DisplayName("Message at 10 is CRITICAL and poison")
        void testAt10_criticalAndPoison() {
            var msg = buildMessage(10);
            assertThat(msg.isPoisonMessage()).isTrue();
            assertThat(msg.severity()).isEqualTo("CRITICAL");
        }

        @Test
        @DisplayName("Empty body message can still be classified")
        void testEmptyBody_stillClassifiable() {
            var msg = new DlqMessage("id", "handle", "t1", "evt-1",
                    "StepFailed", "Unknown", 7, NOW, "");
            assertThat(msg.isPoisonMessage()).isTrue();
            assertThat(msg.severity()).isEqualTo("HIGH");
        }
    }
}
