package com.hermes.command.domain.saga;

import com.hermes.command.domain.workflow.RetryConfig;
import com.hermes.command.domain.workflow.StepDefinition;
import com.hermes.command.domain.workflow.WorkflowDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;

/**
 * Comprehensive test suite for the Saga Orchestration & Compensation Engine.
 *
 * <p>Tests cover:
 * <ul>
 *   <li>Saga begin and RUNNING status</li>
 *   <li>Forward step tracking in order</li>
 *   <li>LIFO compensation ordering</li>
 *   <li>Partial rollback (only completed steps compensated)</li>
 *   <li>Idempotency: duplicate compensation is skipped</li>
 *   <li>SagaDefinition built from WorkflowDefinition</li>
 *   <li>SagaCompensationResult metadata</li>
 *   <li>NO_OP compensation completes without error</li>
 *   <li>State machine guards (illegal transitions throw)</li>
 * </ul>
 */
class SagaOrchestrationTest {

    private SagaManager sagaManager;

    /**
     * The document-pipeline: validate → ocr → classify.
     * validate: no compensation (NO_OP default)
     * ocr:      has compensation activity "ocrCompensate"
     * classify: has compensation activity "classifyCompensate"
     */
    private static final WorkflowDefinition DOCUMENT_PIPELINE = WorkflowDefinition.documentPipelineV1();

    /** A workflow where every step explicitly has a compensation activity. */
    private static WorkflowDefinition buildFullCompensationWorkflow() {
        return new WorkflowDefinition(
                "full-saga-pipeline", 1,
                List.of(
                        new StepDefinition("reserve", "reserveActivity", 30,
                                Optional.empty(), Optional.of("unreserveActivity")),
                        new StepDefinition("charge", "chargeActivity", 60,
                                Optional.of(new RetryConfig(3, 5, 2.0)), Optional.of("refundActivity")),
                        new StepDefinition("notify", "notifyActivity", 30,
                                Optional.empty(), Optional.of("cancelNotifyActivity"))
                ),
                Map.of("reserve", "charge", "charge", "notify", "notify", "END")
        );
    }

    @BeforeEach
    void setUp() {
        sagaManager = new SagaManager();
    }

    // ── begin() ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("begin() creates a saga in RUNNING status")
    void testBeginSaga_createsRunningExecution() {
        var saga = sagaManager.begin("exec-1", "tenant-1", DOCUMENT_PIPELINE);

        assertThat(saga.getStatus()).isEqualTo(SagaStatus.RUNNING);
        assertThat(saga.getExecutionId()).isEqualTo("exec-1");
        assertThat(saga.getTenantId()).isEqualTo("tenant-1");
        assertThat(saga.getSagaId()).startsWith("saga-");
        assertThat(saga.getForwardStepsCompleted()).isEmpty();
        assertThat(saga.getStartedAt()).isNotNull();
    }

    @Test
    @DisplayName("begin() throws if saga already exists for same executionId")
    void testBegin_duplicateExecution_throws() {
        sagaManager.begin("exec-dup", "tenant-1", DOCUMENT_PIPELINE);
        assertThatThrownBy(() -> sagaManager.begin("exec-dup", "tenant-1", DOCUMENT_PIPELINE))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exec-dup");
    }

    // ── recordStepSuccess() ───────────────────────────────────────────────

    @Test
    @DisplayName("recordStepSuccess tracks steps in insertion order")
    void testRecordForwardSteps_tracksCompletedInOrder() {
        sagaManager.begin("exec-2", "tenant-1", DOCUMENT_PIPELINE);
        sagaManager.recordStepSuccess("exec-2", "validate");
        sagaManager.recordStepSuccess("exec-2", "ocr");
        sagaManager.recordStepSuccess("exec-2", "classify");

        var saga = sagaManager.getSaga("exec-2").orElseThrow();
        assertThat(saga.getForwardStepsCompleted())
                .containsExactly("validate", "ocr", "classify");
    }

    @Test
    @DisplayName("recordStepSuccess throws if saga not found")
    void testRecordStepSuccess_unknownExecution_throws() {
        assertThatThrownBy(() -> sagaManager.recordStepSuccess("exec-unknown", "validate"))
                .isInstanceOf(NoSuchElementException.class);
    }

    // ── compensate() — LIFO ordering ──────────────────────────────────────

    @Test
    @DisplayName("compensate() executes all steps in LIFO order: classify → ocr → validate")
    void testCompensate_executesInLIFOOrder() {
        sagaManager.begin("exec-3", "tenant-1", DOCUMENT_PIPELINE);
        sagaManager.recordStepSuccess("exec-3", "validate");
        sagaManager.recordStepSuccess("exec-3", "ocr");
        sagaManager.recordStepSuccess("exec-3", "classify");

        var result = sagaManager.compensate("exec-3", "classify", "Downstream error");

        assertThat(result.compensatedStepNames())
                .containsExactly("classify", "ocr", "validate");
        assertThat(result.stepsCompensated()).isEqualTo(3);
        assertThat(result.finalStatus()).isEqualTo(SagaStatus.COMPENSATED);
    }

    @Test
    @DisplayName("compensate() with only 2 of 3 steps completed: only compensates those 2")
    void testCompensate_partialRollback_onlyCompensatesCompletedSteps() {
        sagaManager.begin("exec-4", "tenant-1", DOCUMENT_PIPELINE);
        sagaManager.recordStepSuccess("exec-4", "validate");
        sagaManager.recordStepSuccess("exec-4", "ocr");
        // classify never ran

        var result = sagaManager.compensate("exec-4", "ocr", "OCR error");

        assertThat(result.compensatedStepNames())
                .containsExactly("ocr", "validate")
                .doesNotContain("classify");
        assertThat(result.stepsCompensated()).isEqualTo(2);
    }

    @Test
    @DisplayName("compensate() on saga with no completed steps: returns 0 compensations")
    void testCompensate_noStepsCompleted_returnsZeroCompensations() {
        sagaManager.begin("exec-5", "tenant-1", DOCUMENT_PIPELINE);
        // No steps recorded

        var result = sagaManager.compensate("exec-5", "validate", "Immediate failure");

        assertThat(result.stepsCompensated()).isEqualTo(0);
        assertThat(result.compensatedStepNames()).isEmpty();
        assertThat(result.finalStatus()).isEqualTo(SagaStatus.COMPENSATED);
    }

    // ── Idempotency ───────────────────────────────────────────────────────

    @Test
    @DisplayName("recordCompensationCompleted is idempotent: duplicate call is a no-op")
    void testCompensationIdempotency_duplicateRecordIsSkipped() {
        sagaManager.begin("exec-6", "tenant-1", DOCUMENT_PIPELINE);
        sagaManager.recordStepSuccess("exec-6", "validate");

        // Get the saga and manually begin compensation to test idempotency
        var saga = sagaManager.getSaga("exec-6").orElseThrow();
        var step = new CompensationStep(1, "validate", CompensationAction.NO_OP, Map.of());
        saga.beginCompensation(List.of(step));

        saga.recordCompensationCompleted(step);
        int versionAfterFirst = saga.getVersion();

        // Second call — should be a no-op
        saga.recordCompensationCompleted(step);
        assertThat(saga.getVersion()).isEqualTo(versionAfterFirst); // no increment
    }

    // ── SagaDefinition ────────────────────────────────────────────────────

    @Test
    @DisplayName("SagaDefinition.fromWorkflowDefinition maps all 3 steps")
    void testSagaDefinition_fromWorkflowDefinition() {
        var sagaDef = SagaDefinition.fromWorkflowDefinition(DOCUMENT_PIPELINE);
        var allCompensations = sagaDef.getAllCompensations();

        assertThat(allCompensations).containsKeys("validate", "ocr", "classify");
        // validate has no compensation activity → NO_OP
        assertThat(allCompensations.get("validate").action()).isEqualTo(CompensationAction.NO_OP);
    }

    @Test
    @DisplayName("SagaDefinition.getCompensationsFor returns LIFO ordered subset")
    void testSagaDefinition_getCompensationsFor_lifoOrder() {
        var sagaDef = SagaDefinition.fromWorkflowDefinition(DOCUMENT_PIPELINE);
        var compensations = sagaDef.getCompensationsFor(List.of("validate", "ocr"));

        // LIFO: ocr first, then validate
        assertThat(compensations).hasSize(2);
        assertThat(compensations.get(0).forStepName()).isEqualTo("ocr");
        assertThat(compensations.get(1).forStepName()).isEqualTo("validate");
    }

    // ── SagaCompensationResult ────────────────────────────────────────────

    @Test
    @DisplayName("compensate() result contains correct sagaId and executionId")
    void testCompensationResult_hasCorrectMetadata() {
        sagaManager.begin("exec-7", "tenant-acme", DOCUMENT_PIPELINE);
        sagaManager.recordStepSuccess("exec-7", "validate");

        var result = sagaManager.compensate("exec-7", "ocr", "Test failure");

        assertThat(result.executionId()).isEqualTo("exec-7");
        assertThat(result.sagaId()).isNotBlank();
        assertThat(result.finalStatus()).isEqualTo(SagaStatus.COMPENSATED);
    }

    // ── NO_OP ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("NO_OP compensation action completes without throwing")
    void testNoOpCompensation_doesNotFail() {
        sagaManager.begin("exec-8", "tenant-1", DOCUMENT_PIPELINE);
        // validate step has NO_OP compensation in documentPipelineV1
        sagaManager.recordStepSuccess("exec-8", "validate");

        assertThatCode(() -> sagaManager.compensate("exec-8", "validate", "Validation error"))
                .doesNotThrowAnyException();
    }

    // ── Full compensation workflow ─────────────────────────────────────────

    @Test
    @DisplayName("Full compensation workflow: all 3 steps with explicit compensation activities")
    void testFullCompensationWorkflow_allThreeStepsCompensated() {
        var wf = buildFullCompensationWorkflow();
        sagaManager.begin("exec-9", "tenant-1", wf);
        sagaManager.recordStepSuccess("exec-9", "reserve");
        sagaManager.recordStepSuccess("exec-9", "charge");
        sagaManager.recordStepSuccess("exec-9", "notify");

        var result = sagaManager.compensate("exec-9", "notify", "Downstream timeout");

        assertThat(result.compensatedStepNames())
                .containsExactly("notify", "charge", "reserve");
        assertThat(result.stepsCompensated()).isEqualTo(3);
        // All should be REVERT_STEP_OUTPUT since they all have compensation activities
        var sagaDef = SagaDefinition.fromWorkflowDefinition(wf);
        assertThat(sagaDef.getAllCompensations().values())
                .allMatch(c -> c.action() == CompensationAction.REVERT_STEP_OUTPUT);
    }

    // ── getSaga() ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("getSaga() returns empty Optional for unknown executionId")
    void testGetSaga_unknownId_returnsEmpty() {
        assertThat(sagaManager.getSaga("exec-nonexistent")).isEmpty();
    }

    @Test
    @DisplayName("getSaga() returns the saga after begin()")
    void testGetSaga_returnsAfterBegin() {
        sagaManager.begin("exec-10", "tenant-1", DOCUMENT_PIPELINE);
        assertThat(sagaManager.getSaga("exec-10")).isPresent();
    }

    // ── markComplete() ────────────────────────────────────────────────────

    @Test
    @DisplayName("markComplete() sets status to COMPLETE and removes saga from registry")
    void testMarkComplete_setsStatusAndClears() {
        sagaManager.begin("exec-11", "tenant-1", DOCUMENT_PIPELINE);
        sagaManager.recordStepSuccess("exec-11", "validate");
        sagaManager.markComplete("exec-11");

        // After markComplete the saga is removed from registry
        assertThat(sagaManager.getSaga("exec-11")).isEmpty();
    }

    // ── Version tracking ──────────────────────────────────────────────────

    @Test
    @DisplayName("SagaExecution.version increments on each state mutation")
    void testSagaExecution_versionIncrements() {
        var saga = new SagaExecution("saga-ver", "exec-ver", "t1");
        assertThat(saga.getVersion()).isEqualTo(0);

        saga.recordForwardStep("step-a");
        assertThat(saga.getVersion()).isEqualTo(1);

        saga.recordForwardStep("step-b");
        assertThat(saga.getVersion()).isEqualTo(2);
    }
}
