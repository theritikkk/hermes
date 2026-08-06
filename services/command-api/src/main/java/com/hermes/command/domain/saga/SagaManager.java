package com.hermes.command.domain.saga;

import com.hermes.command.domain.workflow.WorkflowDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Orchestrates distributed Saga transactions for workflow executions.
 *
 * <p><b>Saga Protocol</b>:
 * <ol>
 *   <li>Before each forward step executes, the caller invokes {@link #begin} once.</li>
 *   <li>After each forward step succeeds, the caller invokes {@link #recordStepSuccess}.</li>
 *   <li>If any step fails, the caller invokes {@link #compensate}. This triggers automatic
 *       LIFO rollback of all completed forward steps.</li>
 *   <li>If all steps succeed, the caller invokes {@link #markComplete}.</li>
 * </ol>
 *
 * <p><b>Production note</b>: The in-memory {@code ConcurrentHashMap} is intentionally
 * scoped to a single JVM. In production, {@code SagaExecution} state is persisted to
 * DynamoDB using conditional writes for optimistic locking, and the map here is a
 * write-through cache. Entries expire via DynamoDB TTL after saga completion.
 */
@Service
public class SagaManager {

    private static final Logger log = LoggerFactory.getLogger(SagaManager.class);

    /**
     * In-memory saga registry.
     * Key: executionId.
     * Production: backed by DynamoDB with optimistic locking.
     */
    private final ConcurrentHashMap<String, SagaExecution> activeSagas = new ConcurrentHashMap<>();

    /**
     * Tracks which workflow definition is associated with each active saga
     * (needed at compensation time to rebuild the SagaDefinition).
     */
    private final ConcurrentHashMap<String, WorkflowDefinition> workflowsByExecution = new ConcurrentHashMap<>();

    // ── Public API ────────────────────────────────────────────────────────

    /**
     * Begins a new saga for the given workflow execution.
     *
     * @param executionId the workflow execution identifier
     * @param tenantId    the owning tenant
     * @param workflow    the workflow definition driving this execution
     * @return the newly created {@link SagaExecution} in RUNNING status
     * @throws IllegalArgumentException if a saga for this executionId already exists
     */
    public SagaExecution begin(String executionId, String tenantId, WorkflowDefinition workflow) {
        String sagaId = "saga-" + UUID.randomUUID();
        SagaExecution saga = new SagaExecution(sagaId, executionId, tenantId);

        SagaExecution existing = activeSagas.putIfAbsent(executionId, saga);
        if (existing != null) {
            throw new IllegalArgumentException(
                    "Saga already exists for executionId=" + executionId + " sagaId=" + existing.getSagaId());
        }

        workflowsByExecution.put(executionId, workflow);

        log.info("[Saga] BEGIN sagaId={} executionId={} tenant={} workflow={}:v{}",
                sagaId, executionId, tenantId, workflow.getName(), workflow.getVersion());
        return saga;
    }

    /**
     * Records that a forward step completed successfully.
     *
     * @param executionId the workflow execution
     * @param stepName    the step that just completed
     * @throws NoSuchElementException if no saga exists for this executionId
     */
    public void recordStepSuccess(String executionId, String stepName) {
        SagaExecution saga = requireSaga(executionId);
        saga.recordForwardStep(stepName);

        log.info("[Saga] STEP_SUCCESS sagaId={} executionId={} step={} totalCompleted={}",
                saga.getSagaId(), executionId, stepName, saga.getForwardStepsCompleted().size());
    }

    /**
     * Executes LIFO compensation for all completed forward steps.
     *
     * <p>Algorithm:
     * <ol>
     *   <li>Look up the saga by executionId.</li>
     *   <li>Build a {@link SagaDefinition} from the associated workflow.</li>
     *   <li>Get LIFO-ordered compensations for all completed steps.</li>
     *   <li>For each: check idempotency, execute, record completion.</li>
     *   <li>Mark the saga as COMPENSATED.</li>
     * </ol>
     *
     * @param executionId    the workflow execution that failed
     * @param failedStepName the step that triggered the failure
     * @param failureReason  human-readable failure description
     * @return {@link SagaCompensationResult} summarising what was rolled back
     * @throws NoSuchElementException   if no saga exists for this executionId
     * @throws SagaCompensationException if compensation itself fails
     */
    public SagaCompensationResult compensate(
            String executionId, String failedStepName, String failureReason) {

        SagaExecution saga = requireSaga(executionId);
        WorkflowDefinition workflow = workflowsByExecution.get(executionId);

        log.warn("[Saga] COMPENSATION_STARTED sagaId={} executionId={} failedStep={} reason={}",
                saga.getSagaId(), executionId, failedStepName, failureReason);

        // Build the compensation plan for this workflow
        SagaDefinition sagaDefinition = SagaDefinition.fromWorkflowDefinition(workflow);
        List<CompensationStep> compensationPlan =
                sagaDefinition.getCompensationsFor(saga.getForwardStepsCompleted());

        // Transition saga into COMPENSATING
        saga.beginCompensation(compensationPlan);

        List<String> compensatedStepNames = new ArrayList<>();

        for (CompensationStep step : compensationPlan) {
            // Idempotency guard — skip if already compensated (at-least-once delivery safety)
            if (saga.isCompensationAlreadyExecuted(step.forStepName())) {
                log.warn("[Saga] COMPENSATION_SKIPPED (idempotent) sagaId={} step={}",
                        saga.getSagaId(), step.forStepName());
                continue;
            }

            try {
                executeCompensation(saga.getSagaId(), step);
                saga.recordCompensationCompleted(step);
                compensatedStepNames.add(step.forStepName());
            } catch (Exception e) {
                log.error("[Saga] COMPENSATION_STEP_FAILED sagaId={} step={} action={}: {}",
                        saga.getSagaId(), step.forStepName(), step.action(), e.getMessage(), e);
                throw new SagaCompensationException(
                        "Compensation failed for step=" + step.forStepName()
                                + " in saga=" + saga.getSagaId(), e);
            }
        }

        saga.markCompensated();

        log.info("[Saga] COMPENSATION_COMPLETE sagaId={} executionId={} stepsCompensated={}",
                saga.getSagaId(), executionId, compensatedStepNames.size());

        return new SagaCompensationResult(
                saga.getSagaId(),
                executionId,
                compensatedStepNames.size(),
                Collections.unmodifiableList(compensatedStepNames),
                saga.getStatus()
        );
    }

    /**
     * Marks the saga as successfully complete (all forward steps passed).
     * Removes it from the in-memory registry.
     *
     * @param executionId the completed workflow execution
     */
    public void markComplete(String executionId) {
        SagaExecution saga = requireSaga(executionId);
        saga.markComplete();
        activeSagas.remove(executionId);
        workflowsByExecution.remove(executionId);
        log.info("[Saga] COMPLETE sagaId={} executionId={}", saga.getSagaId(), executionId);
    }

    /**
     * Returns the active saga for the given execution, if any.
     */
    public Optional<SagaExecution> getSaga(String executionId) {
        return Optional.ofNullable(activeSagas.get(executionId));
    }

    // ── Private ───────────────────────────────────────────────────────────

    /**
     * Dispatches a compensation action to the appropriate platform handler.
     *
     * <p>In production each branch would call the relevant AWS SDK client:
     * S3 delete, DynamoDB conditional delete for lock release, EventBridge publish, etc.
     * Here they emit structured log entries that act as an audit trail.
     */
    private void executeCompensation(String sagaId, CompensationStep step) {
        log.info("[Saga] COMPENSATING sagaId={} step={} action={} context={}",
                sagaId, step.forStepName(), step.action(), step.context());

        switch (step.action()) {
            case RELEASE_LOCK -> {
                String lockKey = (String) step.context().getOrDefault("lockKey", "unknown");
                log.info("[Saga][RELEASE_LOCK] Releasing DynamoDB lock: key={} sagaId={}", lockKey, sagaId);
                // Production: dynamoDbClient.deleteItem(DeleteItemRequest.builder()...condition("attribute_exists(PK)").build())
            }
            case DELETE_S3_ARTIFACT -> {
                String s3Key = (String) step.context().getOrDefault("s3Key", "unknown");
                String bucket = (String) step.context().getOrDefault("bucket", "hermes-artifacts");
                log.info("[Saga][DELETE_S3_ARTIFACT] Deleting s3://{}/{} sagaId={}", bucket, s3Key, sagaId);
                // Production: s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(s3Key).build())
            }
            case NOTIFY_FAILURE -> {
                String reason = (String) step.context().getOrDefault("failureReason", "Saga compensation");
                log.warn("[Saga][NOTIFY_FAILURE] Publishing failure notification: reason={} sagaId={}", reason, sagaId);
                // Production: eventBridgeClient.putEvents(...)
            }
            case RELEASE_QUOTA -> {
                String tenantId = (String) step.context().getOrDefault("tenantId", "unknown");
                log.info("[Saga][RELEASE_QUOTA] Releasing quota reservation for tenant={} sagaId={}", tenantId, sagaId);
                // Production: dynamoDbClient.updateItem(UpdateItemRequest...ADD quotaUsed -1...)
            }
            case REVERT_STEP_OUTPUT -> {
                String compensationActivity = (String) step.context().getOrDefault("compensationActivity", "unknown");
                log.info("[Saga][REVERT_STEP_OUTPUT] Reverting step output via activity={} sagaId={}", compensationActivity, sagaId);
                // Production: invoke Lambda activity via Step Functions task token
            }
            case NO_OP -> log.debug("[Saga][NO_OP] No compensation needed for step={} sagaId={}", step.forStepName(), sagaId);
        }
    }

    private SagaExecution requireSaga(String executionId) {
        SagaExecution saga = activeSagas.get(executionId);
        if (saga == null) {
            throw new NoSuchElementException("No active saga found for executionId=" + executionId);
        }
        return saga;
    }
}
