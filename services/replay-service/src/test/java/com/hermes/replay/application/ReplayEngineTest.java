package com.hermes.replay.application;

import com.hermes.replay.domain.DomainEvent;
import com.hermes.replay.domain.ReplayJob;
import com.hermes.replay.domain.ReplayJobStatus;
import com.hermes.replay.domain.TenantId;
import com.hermes.replay.infrastructure.eventstore.DynamoDbEventStoreReader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Comprehensive test suite for the Replay Engine.
 *
 * <p>Covers:
 * <ul>
 *   <li>Full end-of-stream projection</li>
 *   <li>Point-in-time projection by sequence number</li>
 *   <li>Point-in-time projection by timestamp</li>
 *   <li>Delta computation: cached outputs vs re-dispatch</li>
 *   <li>Empty stream edge case</li>
 *   <li>ReplayJob lifecycle state transitions</li>
 * </ul>
 */
class ReplayEngineTest {

    private ExecutionStateProjector projector;
    private DynamoDbEventStoreReader eventStoreReader;

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static final Instant BASE_TIME = Instant.parse("2026-08-06T00:00:00Z");

    private DomainEvent buildEvent(String type, int seq, Map<String, Object> payload) {
        return new DomainEvent(
                "evt-" + seq,
                type,
                "EXECUTION",
                "exec-abc",
                "tenant-1",
                "corr-1",
                BASE_TIME.plusSeconds(seq * 10L),
                seq,
                payload
        );
    }

    /** Five events: start → validate completed → ocr completed → classify completed → workflow completed */
    private List<DomainEvent> buildFullStream() {
        return List.of(
                buildEvent("WORKFLOW_EXECUTION_STARTED", 1,
                        Map.of("workflowName", "document-pipeline", "workflowVersion", 1, "assetId", "asset-1")),
                buildEvent("STEP_COMPLETED", 2,
                        Map.of("stepName", "validate", "output", Map.of("valid", true))),
                buildEvent("STEP_COMPLETED", 3,
                        Map.of("stepName", "ocr", "output", Map.of("text", "Invoice #001"))),
                buildEvent("STEP_COMPLETED", 4,
                        Map.of("stepName", "classify", "output", Map.of("type", "INVOICE"))),
                buildEvent("WORKFLOW_EXECUTION_COMPLETED", 5, Map.of("executionId", "exec-abc"))
        );
    }

    @BeforeEach
    void setUp() {
        projector = new ExecutionStateProjector();
        eventStoreReader = mock(DynamoDbEventStoreReader.class);
    }

    // ── Pillar 1a: ExecutionStateProjector ────────────────────────────────

    @Test
    @DisplayName("projectToEnd produces COMPLETED snapshot with all 3 steps")
    void testFullProjection_producesCompleteSnapshot() {
        var snapshot = projector.projectToEnd(buildFullStream());

        assertThat(snapshot.status()).isEqualTo(ExecutionStateProjector.ExecutionStatus.COMPLETED);
        assertThat(snapshot.workflowName()).isEqualTo("document-pipeline");
        assertThat(snapshot.workflowVersion()).isEqualTo(1);
        assertThat(snapshot.stepExecutionOrder()).containsExactly("validate", "ocr", "classify");
        assertThat(snapshot.completedStepOutputs()).containsKeys("validate", "ocr", "classify");
        assertThat(snapshot.lastSequence()).isEqualTo(5);
    }

    @Test
    @DisplayName("projectToSequence(2) returns only the validate step — RUNNING status")
    void testProjectToSequence_returnsPartialState() {
        var snapshot = projector.projectToSequence(buildFullStream(), 2);

        assertThat(snapshot.status()).isEqualTo(ExecutionStateProjector.ExecutionStatus.RUNNING);
        assertThat(snapshot.stepExecutionOrder()).containsExactly("validate");
        assertThat(snapshot.completedStepOutputs()).containsOnlyKeys("validate");
        assertThat(snapshot.lastSequence()).isEqualTo(2);
    }

    @Test
    @DisplayName("projectToTimestamp before ocr event returns only validate in snapshot")
    void testProjectToTimestamp_returnsStateAtInstant() {
        // OCR event is at BASE_TIME + 30s (seq=3). Timestamp between seq 2 and seq 3.
        Instant cutoff = BASE_TIME.plusSeconds(25);
        var snapshot = projector.projectToTimestamp(buildFullStream(), cutoff);

        assertThat(snapshot.stepExecutionOrder()).containsExactly("validate");
        assertThat(snapshot.completedStepOutputs()).containsOnlyKeys("validate");
    }

    @Test
    @DisplayName("computeDelta from-step=ocr: validate cached, ocr+classify to replay")
    void testComputeDelta_identifiesStepsToSkipAndReplay() {
        var fullSnapshot = projector.projectToEnd(buildFullStream());
        // Boundary: sequence 2 (only validate completed)
        var boundarySnapshot = projector.projectToSequence(buildFullStream(), 2);

        var delta = projector.computeDelta(fullSnapshot, boundarySnapshot);

        assertThat(delta.cachedOutputsToInject()).containsOnlyKeys("validate");
        assertThat(delta.stepsToReplay()).containsExactly("ocr", "classify");
        assertThat(delta.stepsSkipped()).isEqualTo(1);
        assertThat(delta.totalOriginalSteps()).isEqualTo(3);
    }

    @Test
    @DisplayName("empty event stream returns PENDING empty snapshot without throwing")
    void testProjectToEnd_emptyStream_returnsEmptySnapshot() {
        var snapshot = projector.projectToEnd(Collections.emptyList());

        assertThat(snapshot.status()).isEqualTo(ExecutionStateProjector.ExecutionStatus.PENDING);
        assertThat(snapshot.stepExecutionOrder()).isEmpty();
        assertThat(snapshot.completedStepOutputs()).isEmpty();
        assertThat(snapshot.lastSequence()).isEqualTo(0);
    }

    @Test
    @DisplayName("STEP_FAILED event sets snapshot status to FAILED")
    void testStepFailed_setsStatusToFailed() {
        var events = List.of(
                buildEvent("WORKFLOW_EXECUTION_STARTED", 1,
                        Map.of("workflowName", "document-pipeline", "workflowVersion", 1)),
                buildEvent("STEP_COMPLETED", 2, Map.of("stepName", "validate", "output", Map.of())),
                buildEvent("STEP_FAILED", 3, Map.of("stepName", "ocr", "error", "Timeout"))
        );

        var snapshot = projector.projectToEnd(events);

        assertThat(snapshot.status()).isEqualTo(ExecutionStateProjector.ExecutionStatus.FAILED);
        assertThat(snapshot.stepExecutionOrder()).containsExactly("validate");
    }

    // ── Pillar 1b: ReplayJob lifecycle ────────────────────────────────────

    @Test
    @DisplayName("ReplayJob lifecycle: PENDING → RUNNING → COMPLETED")
    void testReplayJobLifecycle_markRunningAndCompleted() {
        var job = ReplayJob.forExecution(
                new TenantId("tenant-1"), "exec-abc",
                "ocr", "Reprocess after OCR fix", "operator-1");

        assertThat(job.getStatus()).isEqualTo(ReplayJobStatus.PENDING);

        job.markRunning();
        assertThat(job.getStatus()).isEqualTo(ReplayJobStatus.RUNNING);

        job.markCompleted(5);
        assertThat(job.getStatus()).isEqualTo(ReplayJobStatus.COMPLETED);
        assertThat(job.getProcessedEventCount()).isEqualTo(5);
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("ReplayJob lifecycle: PENDING → RUNNING → FAILED")
    void testReplayJobLifecycle_markFailed() {
        var job = ReplayJob.forExecution(
                new TenantId("tenant-1"), "exec-xyz", null, "Test", "system");
        job.markRunning();
        job.markFailed();

        assertThat(job.getStatus()).isEqualTo(ReplayJobStatus.FAILED);
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("updateProgress records checkpoint correctly")
    void testReplayJob_updateProgress() {
        var job = ReplayJob.forExecution(
                new TenantId("tenant-1"), "exec-abc", null, "Test", "system");
        job.markRunning();
        job.updateProgress(3, 5, "evt-3");

        assertThat(job.getProcessedEventCount()).isEqualTo(3);
        assertThat(job.getTotalEventCount()).isEqualTo(5);
        assertThat(job.getLastCheckpointEventId()).isEqualTo("evt-3");
    }

    // ── Pillar 1c: ReplayService integration ─────────────────────────────

    @Test
    @DisplayName("replayExecution full replay: all steps re-dispatched, no cache")
    void testReplayService_fullReplay_noSkip() {
        when(eventStoreReader.loadEventStream(eq("EXECUTION"), eq("exec-abc")))
                .thenReturn(buildFullStream());

        var service = new ReplayService(eventStoreReader);
        var request = new com.hermes.replay.api.dto.ReplayExecutionRequest();
        request.setExecutionId("exec-abc");
        request.setSkipCompletedSteps(false);

        var response = service.replayExecution(request, new TenantId("tenant-1"));

        assertThat(response.getStatus()).isEqualTo("COMPLETED");
        assertThat(response.getEventsReplayed()).isEqualTo(5);
        assertThat(response.getStepsSkipped()).isEqualTo(0);
        assertThat(response.getReplayedStepNames()).containsExactlyInAnyOrder("validate", "ocr", "classify");
    }

    @Test
    @DisplayName("replayExecution from-step=ocr: validate cached, ocr+classify re-dispatched")
    void testReplayService_fromStep_cachesPriorSteps() {
        when(eventStoreReader.loadEventStream(eq("EXECUTION"), eq("exec-abc")))
                .thenReturn(buildFullStream());

        var service = new ReplayService(eventStoreReader);
        var request = new com.hermes.replay.api.dto.ReplayExecutionRequest();
        request.setExecutionId("exec-abc");
        request.setFromStep("ocr");
        request.setSkipCompletedSteps(true);

        var response = service.replayExecution(request, new TenantId("tenant-1"));

        assertThat(response.getStepsSkipped()).isEqualTo(1);
        assertThat(response.getCachedOutputsInjected()).containsKey("validate");
        assertThat(response.getReplayedStepNames()).containsExactlyInAnyOrder("ocr", "classify");
    }

    @Test
    @DisplayName("replayExecution by sequence: project to seq 2, re-dispatch ocr+classify")
    void testReplayService_pointInTimeBySequence() {
        when(eventStoreReader.loadEventStream(eq("EXECUTION"), eq("exec-abc")))
                .thenReturn(buildFullStream());

        var service = new ReplayService(eventStoreReader);
        var request = new com.hermes.replay.api.dto.ReplayExecutionRequest();
        request.setExecutionId("exec-abc");
        request.setReplayToSequence(2);
        request.setSkipCompletedSteps(true);

        var response = service.replayExecution(request, new TenantId("tenant-1"));

        assertThat(response.getProjectedToSequence()).isEqualTo(2);
        assertThat(response.getStepsSkipped()).isEqualTo(1);
        assertThat(response.getReplayedStepNames()).contains("ocr", "classify");
    }

    @Test
    @DisplayName("replayExecution falls back to EXEC prefix when EXECUTION stream empty")
    void testReplayService_fallbackToExecPrefix() {
        when(eventStoreReader.loadEventStream(eq("EXECUTION"), anyString()))
                .thenReturn(Collections.emptyList());
        when(eventStoreReader.loadEventStream(eq("EXEC"), eq("exec-abc")))
                .thenReturn(buildFullStream());

        var service = new ReplayService(eventStoreReader);
        var request = new com.hermes.replay.api.dto.ReplayExecutionRequest();
        request.setExecutionId("exec-abc");

        var response = service.replayExecution(request, new TenantId("tenant-1"));

        assertThat(response.getEventsReplayed()).isEqualTo(5);
        verify(eventStoreReader).loadEventStream("EXEC", "exec-abc");
    }
}
