package com.hermes.replay.application;

import com.hermes.replay.api.dto.ReplayExecutionRequest;
import com.hermes.replay.api.dto.ReplayExecutionResponse;
import com.hermes.replay.application.ExecutionStateProjector.ExecutionSnapshot;
import com.hermes.replay.application.ExecutionStateProjector.ReplayDelta;
import com.hermes.replay.application.ExecutionStateProjector.StepOutput;
import com.hermes.replay.domain.DomainEvent;
import com.hermes.replay.domain.ReplayJob;
import com.hermes.replay.domain.TenantId;
import com.hermes.replay.infrastructure.eventstore.DynamoDbEventStoreReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Orchestrates execution replay.
 *
 * <p>Replay algorithm:
 * <ol>
 *   <li>Load the full ordered event stream from DynamoDB.</li>
 *   <li>Project to the end to understand the full original execution state.</li>
 *   <li>If a replay boundary is requested (fromStep / replayToSequence / replayToTimestamp),
 *       also project to that boundary to compute a {@link ReplayDelta}.</li>
 *   <li>Return which steps need re-dispatch and which outputs can be injected from cache.</li>
 * </ol>
 */
@Service
public class ReplayService {

    private static final Logger log = LoggerFactory.getLogger(ReplayService.class);

    private final DynamoDbEventStoreReader eventStoreReader;
    private final ExecutionStateProjector projector;

    public ReplayService(DynamoDbEventStoreReader eventStoreReader) {
        this.eventStoreReader = eventStoreReader;
        this.projector = new ExecutionStateProjector();
    }

    public ReplayExecutionResponse replayExecution(ReplayExecutionRequest request, TenantId tenantId) {
        String executionId = request.getExecutionId();

        log.info("[Replay] Starting replay for execution={} tenant={} fromStep={} replayToSeq={} replayToTs={}",
                executionId, tenantId.value(), request.getFromStep(),
                request.getReplayToSequence(), request.getReplayToTimestamp());

        // ── 1. Load event stream ──────────────────────────────────────────
        List<DomainEvent> events = eventStoreReader.loadEventStream("EXECUTION", executionId);
        if (events.isEmpty()) {
            events = eventStoreReader.loadEventStream("EXEC", executionId);
        }

        // ── 2. Create and start replay job ───────────────────────────────
        ReplayJob job = ReplayJob.forExecution(
                tenantId, executionId, request.getFromStep(),
                request.getReason(), "system");
        job.markRunning();

        try {
            // ── 3. Project full original snapshot ─────────────────────────
            ExecutionSnapshot fullSnapshot = projector.projectToEnd(events);

            // ── 4. Determine replay boundary snapshot ─────────────────────
            ExecutionSnapshot boundarySnapshot;

            if (request.getReplayToSequence() != null) {
                boundarySnapshot = projector.projectToSequence(events, request.getReplayToSequence());

            } else if (request.getReplayToTimestamp() != null) {
                Instant ts = Instant.parse(request.getReplayToTimestamp());
                boundarySnapshot = projector.projectToTimestamp(events, ts);

            } else if (request.getFromStep() != null) {
                // Boundary = sequence just before the fromStep first appeared
                int seqBeforeFromStep = findSequenceBeforeStep(events, request.getFromStep());
                boundarySnapshot = projector.projectToSequence(events, seqBeforeFromStep);

            } else {
                // Full replay from the very beginning: no steps are cached
                boundarySnapshot = projector.projectToSequence(events, 0);
            }

            // ── 5. Compute delta ──────────────────────────────────────────
            ReplayDelta delta;
            if (request.isSkipCompletedSteps()) {
                delta = projector.computeDelta(fullSnapshot, boundarySnapshot);
            } else {
                // Re-dispatch everything, no caching
                delta = new ReplayDelta(
                        new ArrayList<>(fullSnapshot.stepExecutionOrder()),
                        Collections.emptyMap(),
                        fullSnapshot.stepExecutionOrder().size(),
                        0
                );
            }

            // ── 6. Mark job complete ──────────────────────────────────────
            job.markCompleted(events.size());

            // ── 7. Build serialisable cached outputs map ──────────────────
            Map<String, Object> cachedOutputsForResponse = delta.cachedOutputsToInject().entrySet().stream()
                    .collect(Collectors.toMap(
                            Map.Entry::getKey,
                            e -> (Object) e.getValue().output()
                    ));

            String message = String.format(
                    "Replay complete: %d events read, %d steps cached, %d steps to re-dispatch. Execution status at boundary: %s.",
                    events.size(), delta.stepsSkipped(), delta.stepsToReplay().size(), boundarySnapshot.status());

            log.info("[Replay] {} executionId={} replayJobId={}",
                    message, executionId, job.getJobId().value());

            return ReplayExecutionResponse.builder()
                    .replayJobId(job.getJobId().value())
                    .executionId(executionId)
                    .tenantId(tenantId.value())
                    .status(job.getStatus().name())
                    .eventsReplayed(events.size())
                    .stepsSkipped(delta.stepsSkipped())
                    .replayedStepNames(delta.stepsToReplay())
                    .cachedOutputsInjected(cachedOutputsForResponse)
                    .projectedToSequence(boundarySnapshot.lastSequence())
                    .message(message)
                    .build();

        } catch (Exception e) {
            job.markFailed();
            log.error("[Replay] Failed for executionId={}: {}", executionId, e.getMessage(), e);
            throw new ReplayException("Replay failed for execution: " + executionId, e);
        }
    }

    /**
     * Find the highest sequence number of events that occurred BEFORE the given step
     * first appeared as STEP_SCHEDULED or STEP_COMPLETED. Used to set the time-travel
     * boundary for from-step replay.
     */
    private int findSequenceBeforeStep(List<DomainEvent> events, String fromStep) {
        int boundary = 0;
        for (DomainEvent event : events) {
            String type = event.eventType().toUpperCase();
            if ((type.equals("STEP_SCHEDULED") || type.equals("STEP_COMPLETED") || type.equals("STEP_FAILED"))
                    && fromStep.equals(event.payload().get("stepName"))) {
                // Return the sequence just before this event
                return Math.max(0, event.sequence() - 1);
            }
            boundary = event.sequence();
        }
        // Step not found: return end of stream (full replay)
        return boundary;
    }
}
