package com.hermes.command.domain.saga;

import java.time.Instant;
import java.util.*;

/**
 * Tracks the runtime state of a single distributed Saga execution.
 *
 * <p>A {@code SagaExecution} is the mutable ledger that records:
 * <ul>
 *   <li>Which forward steps have successfully completed (in order).</li>
 *   <li>Which compensation steps are pending or have been completed.</li>
 *   <li>The current lifecycle status (RUNNING / COMPENSATING / COMPENSATED / COMPLETE).</li>
 * </ul>
 *
 * <p>In production this aggregate is persisted to DynamoDB with optimistic locking
 * (using a version attribute and a conditional write expression) to ensure exactly-once
 * state transitions even across concurrent Lambda invocations.
 */
public class SagaExecution {

    private final String sagaId;
    private final String executionId;
    private final String tenantId;

    private SagaStatus status;

    /** Forward steps that completed successfully, in order of completion. */
    private final List<String> forwardStepsCompleted;

    /** Compensation steps waiting to be executed (loaded by SagaManager on failure). */
    private final List<CompensationStep> pendingCompensations;

    /** Compensation steps that have already been executed (idempotency log). */
    private final List<CompensationStep> completedCompensations;

    private final Instant startedAt;
    private Instant completedAt;

    /** DynamoDB optimistic-locking version. Incremented on every state mutation. */
    private int version;

    // ── Constructor ──────────────────────────────────────────────────────

    SagaExecution(String sagaId, String executionId, String tenantId) {
        this.sagaId = sagaId;
        this.executionId = executionId;
        this.tenantId = tenantId;
        this.status = SagaStatus.RUNNING;
        this.forwardStepsCompleted = new ArrayList<>();
        this.pendingCompensations = new ArrayList<>();
        this.completedCompensations = new ArrayList<>();
        this.startedAt = Instant.now();
        this.version = 0;
    }

    // ── State mutations ───────────────────────────────────────────────────

    /**
     * Records that a forward step has completed successfully.
     *
     * @param stepName name of the step that just completed
     * @throws IllegalStateException if the saga is not in RUNNING status
     */
    public void recordForwardStep(String stepName) {
        requireStatus(SagaStatus.RUNNING, "record a forward step");
        forwardStepsCompleted.add(stepName);
        version++;
    }

    /**
     * Transitions the saga into COMPENSATING mode and loads the ordered
     * compensation work-list.
     *
     * @param steps LIFO-ordered compensation steps to execute (from {@link SagaDefinition})
     * @throws IllegalStateException if not currently RUNNING
     */
    public void beginCompensation(List<CompensationStep> steps) {
        requireStatus(SagaStatus.RUNNING, "begin compensation");
        this.status = SagaStatus.COMPENSATING;
        this.pendingCompensations.addAll(steps);
        version++;
    }

    /**
     * Records that a specific compensation step has been executed.
     * Moves it from pending → completed.
     *
     * <p>Idempotent: if the step is already in {@code completedCompensations} it
     * is a no-op (guards against at-least-once redelivery).
     */
    public void recordCompensationCompleted(CompensationStep step) {
        requireStatus(SagaStatus.COMPENSATING, "record compensation complete");
        boolean alreadyDone = completedCompensations.stream()
                .anyMatch(c -> c.forStepName().equals(step.forStepName()));
        if (!alreadyDone) {
            pendingCompensations.removeIf(p -> p.forStepName().equals(step.forStepName()));
            completedCompensations.add(step);
            version++;
        }
    }

    /**
     * Marks the saga as fully compensated. All pending compensations must be
     * empty before calling this.
     *
     * @throws IllegalStateException if there are still pending compensations
     */
    public void markCompensated() {
        requireStatus(SagaStatus.COMPENSATING, "mark saga compensated");
        if (!pendingCompensations.isEmpty()) {
            throw new IllegalStateException(
                    "Cannot mark saga compensated: " + pendingCompensations.size() + " pending compensations remain.");
        }
        this.status = SagaStatus.COMPENSATED;
        this.completedAt = Instant.now();
        version++;
    }

    /**
     * Marks the saga as successfully completed (all forward steps passed).
     *
     * @throws IllegalStateException if not currently RUNNING
     */
    public void markComplete() {
        requireStatus(SagaStatus.RUNNING, "mark saga complete");
        this.status = SagaStatus.COMPLETE;
        this.completedAt = Instant.now();
        version++;
    }

    // ── Queries ───────────────────────────────────────────────────────────

    public boolean isCompensating() {
        return status == SagaStatus.COMPENSATING;
    }

    public boolean isTerminal() {
        return status == SagaStatus.COMPENSATED || status == SagaStatus.COMPLETE;
    }

    /** True if a compensation for the given step has already been executed (idempotency check). */
    public boolean isCompensationAlreadyExecuted(String stepName) {
        return completedCompensations.stream()
                .anyMatch(c -> c.forStepName().equals(stepName));
    }

    // ── Accessors ─────────────────────────────────────────────────────────

    public String getSagaId() { return sagaId; }
    public String getExecutionId() { return executionId; }
    public String getTenantId() { return tenantId; }
    public SagaStatus getStatus() { return status; }
    public List<String> getForwardStepsCompleted() { return Collections.unmodifiableList(forwardStepsCompleted); }
    public List<CompensationStep> getPendingCompensations() { return Collections.unmodifiableList(pendingCompensations); }
    public List<CompensationStep> getCompletedCompensations() { return Collections.unmodifiableList(completedCompensations); }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public int getVersion() { return version; }

    // ── Private helpers ───────────────────────────────────────────────────

    private void requireStatus(SagaStatus required, String operationDescription) {
        if (this.status != required) {
            throw new IllegalStateException(String.format(
                    "Cannot %s: saga %s is in status %s, expected %s.",
                    operationDescription, sagaId, status, required));
        }
    }
}
