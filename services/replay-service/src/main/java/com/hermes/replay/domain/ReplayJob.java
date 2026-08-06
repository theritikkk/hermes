package com.hermes.replay.domain;

import java.time.Instant;

/**
 * Aggregate tracking the state of a single replay or projection-rebuild job.
 *
 * Design notes:
 * - Two static factories distinguish the two job kinds so callers cannot mix up fields.
 * - Mutable fields (status, counts, checkpoint) are intentionally package-private so
 *   only domain services inside this package can advance state.
 */
public class ReplayJob {

    private final ReplayJobId jobId;
    private final TenantId tenantId;
    private ReplayJobStatus status;

    /** Present for execution-replay jobs; null for projection-rebuild jobs. */
    private final String targetExecutionId;

    /** Present when replaying from a specific step; null means replay from beginning. */
    private final String fromStep;

    private final String replayReason;
    private final Instant startedAt;
    private Instant completedAt;

    private int processedEventCount;
    private int totalEventCount;
    private String lastCheckpointEventId;

    private final String initiatedByUserId;

    // -------------------------------------------------------------------------
    // Private constructor — use static factories
    // -------------------------------------------------------------------------

    private ReplayJob(
            ReplayJobId jobId,
            TenantId tenantId,
            ReplayJobStatus status,
            String targetExecutionId,
            String fromStep,
            String replayReason,
            Instant startedAt,
            String initiatedByUserId) {
        this.jobId = jobId;
        this.tenantId = tenantId;
        this.status = status;
        this.targetExecutionId = targetExecutionId;
        this.fromStep = fromStep;
        this.replayReason = replayReason;
        this.startedAt = startedAt;
        this.initiatedByUserId = initiatedByUserId;
        this.processedEventCount = 0;
        this.totalEventCount = 0;
    }

    // -------------------------------------------------------------------------
    // Static factories
    // -------------------------------------------------------------------------

    /**
     * Creates a job for replaying a specific workflow execution,
     * optionally resuming from a given step.
     */
    public static ReplayJob forExecution(
            TenantId tenantId,
            String targetExecutionId,
            String fromStep,
            String replayReason,
            String initiatedByUserId) {
        return new ReplayJob(
                ReplayJobId.generate(),
                tenantId,
                ReplayJobStatus.PENDING,
                targetExecutionId,
                fromStep,
                replayReason,
                Instant.now(),
                initiatedByUserId
        );
    }

    /**
     * Creates a job for a full projection rebuild (no specific execution target).
     */
    public static ReplayJob forProjectionRebuild(
            TenantId tenantId,
            String replayReason,
            String initiatedByUserId) {
        return new ReplayJob(
                ReplayJobId.generate(),
                tenantId,
                ReplayJobStatus.PENDING,
                null,
                null,
                replayReason,
                Instant.now(),
                initiatedByUserId
        );
    }

    // -------------------------------------------------------------------------
    // State transitions
    // -------------------------------------------------------------------------

    public void markRunning() {
        this.status = ReplayJobStatus.RUNNING;
    }

    public void markCompleted(int processedEventCount) {
        this.status = ReplayJobStatus.COMPLETED;
        this.processedEventCount = processedEventCount;
        this.completedAt = Instant.now();
    }

    public void markFailed() {
        this.status = ReplayJobStatus.FAILED;
        this.completedAt = Instant.now();
    }

    public void updateProgress(int processedEventCount, int totalEventCount, String lastCheckpointEventId) {
        this.processedEventCount = processedEventCount;
        this.totalEventCount = totalEventCount;
        this.lastCheckpointEventId = lastCheckpointEventId;
    }

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public ReplayJobId getJobId() { return jobId; }
    public TenantId getTenantId() { return tenantId; }
    public ReplayJobStatus getStatus() { return status; }
    public String getTargetExecutionId() { return targetExecutionId; }
    public String getFromStep() { return fromStep; }
    public String getReplayReason() { return replayReason; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public int getProcessedEventCount() { return processedEventCount; }
    public int getTotalEventCount() { return totalEventCount; }
    public String getLastCheckpointEventId() { return lastCheckpointEventId; }
    public String getInitiatedByUserId() { return initiatedByUserId; }
}
