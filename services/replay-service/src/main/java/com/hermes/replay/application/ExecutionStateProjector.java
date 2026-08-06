package com.hermes.replay.application;

import java.time.Instant;
import java.util.*;

/**
 * Pure domain service — no Spring dependency.
 * Folds over an ordered event stream to project aggregate state at any
 * point in time (by sequence number or wall-clock timestamp).
 */
public class ExecutionStateProjector {

    public enum ExecutionStatus { PENDING, RUNNING, COMPLETED, FAILED }

    // ── Value types ───────────────────────────────────────────────────────

    /**
     * Immutable output captured when a step completed.
     */
    public record StepOutput(
            String stepName,
            Map<String, Object> output,
            Instant completedAt,
            int sequence
    ) {}

    /**
     * Full projected state of an execution at a given point in its history.
     */
    public record ExecutionSnapshot(
            String executionId,
            String tenantId,
            String workflowName,
            int workflowVersion,
            ExecutionStatus status,
            Map<String, StepOutput> completedStepOutputs,   // stepName → StepOutput
            List<String> stepExecutionOrder,                 // ordered by completion time
            int lastSequence
    ) {
        /** Convenience: is there a usable cached output for this step? */
        public boolean hasCachedOutput(String stepName) {
            return completedStepOutputs.containsKey(stepName);
        }
    }

    /**
     * The difference between an original snapshot and the replay boundary:
     * which steps can be injected from cache vs must be re-dispatched.
     */
    public record ReplayDelta(
            List<String> stepsToReplay,
            Map<String, StepOutput> cachedOutputsToInject,
            int totalOriginalSteps,
            int stepsSkipped
    ) {}

    // ── Projection methods ────────────────────────────────────────────────

    /**
     * Project full event history to the final state.
     */
    public ExecutionSnapshot projectToEnd(List<com.hermes.replay.domain.DomainEvent> events) {
        return fold(events, Integer.MAX_VALUE, Instant.MAX);
    }

    /**
     * Time-travel: project only events whose sequence ≤ targetSequence.
     * Useful for "what was the state just before step N ran?".
     */
    public ExecutionSnapshot projectToSequence(
            List<com.hermes.replay.domain.DomainEvent> events, int targetSequence) {
        return fold(events, targetSequence, Instant.MAX);
    }

    /**
     * Time-travel: project only events that occurred at or before targetTimestamp.
     */
    public ExecutionSnapshot projectToTimestamp(
            List<com.hermes.replay.domain.DomainEvent> events, Instant targetTimestamp) {
        return fold(events, Integer.MAX_VALUE, targetTimestamp);
    }

    /**
     * Compute the replay delta between a full original snapshot and a
     * partial snapshot taken at the replay boundary.
     *
     * @param original      full history projection
     * @param atReplayPoint projection at the replay boundary (e.g. from-step)
     * @return delta describing which steps need re-dispatch and which are cached
     */
    public ReplayDelta computeDelta(ExecutionSnapshot original, ExecutionSnapshot atReplayPoint) {
        // Steps completed in the original run
        List<String> originalOrder = original.stepExecutionOrder();
        // Steps already completed at the replay point (can be cached)
        Set<String> cachedStepNames = atReplayPoint.completedStepOutputs().keySet();

        List<String> stepsToReplay = new ArrayList<>();
        Map<String, StepOutput> cachedOutputsToInject = new LinkedHashMap<>();

        for (String step : originalOrder) {
            if (cachedStepNames.contains(step)) {
                cachedOutputsToInject.put(step, atReplayPoint.completedStepOutputs().get(step));
            } else {
                stepsToReplay.add(step);
            }
        }

        // Also include steps in the original that weren't in the replay-point order
        for (String step : original.completedStepOutputs().keySet()) {
            if (!cachedStepNames.contains(step) && !stepsToReplay.contains(step)) {
                stepsToReplay.add(step);
            }
        }

        return new ReplayDelta(
                Collections.unmodifiableList(stepsToReplay),
                Collections.unmodifiableMap(cachedOutputsToInject),
                originalOrder.size(),
                cachedOutputsToInject.size()
        );
    }

    // ── Private fold ──────────────────────────────────────────────────────

    private ExecutionSnapshot fold(
            List<com.hermes.replay.domain.DomainEvent> events,
            int maxSequence,
            Instant maxTimestamp) {

        if (events == null || events.isEmpty()) {
            return emptySnapshot();
        }

        // Mutable fold accumulators
        String executionId = null;
        String tenantId = null;
        String workflowName = null;
        int workflowVersion = 0;
        ExecutionStatus status = ExecutionStatus.PENDING;
        Map<String, StepOutput> completedStepOutputs = new LinkedHashMap<>();
        List<String> stepExecutionOrder = new ArrayList<>();
        int lastSequence = 0;

        for (com.hermes.replay.domain.DomainEvent event : events) {
            // Time-travel boundary checks
            if (event.sequence() > maxSequence) break;
            if (event.occurredAt() != null && event.occurredAt().isAfter(maxTimestamp)) break;

            lastSequence = event.sequence();
            String type = event.eventType().toUpperCase();

            switch (type) {
                case "WORKFLOW_EXECUTION_STARTED" -> {
                    executionId = event.aggregateId();
                    tenantId = event.tenantId();
                    workflowName = payloadStr(event, "workflowName");
                    workflowVersion = payloadInt(event, "workflowVersion");
                    status = ExecutionStatus.RUNNING;
                }
                case "STEP_COMPLETED" -> {
                    String stepName = payloadStr(event, "stepName");
                    if (stepName != null) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> output = event.payload().containsKey("output")
                                ? (Map<String, Object>) event.payload().get("output")
                                : Collections.emptyMap();
                        completedStepOutputs.put(stepName,
                                new StepOutput(stepName, output, event.occurredAt(), event.sequence()));
                        if (!stepExecutionOrder.contains(stepName)) {
                            stepExecutionOrder.add(stepName);
                        }
                    }
                }
                case "STEP_FAILED" -> status = ExecutionStatus.FAILED;
                case "WORKFLOW_EXECUTION_COMPLETED" -> status = ExecutionStatus.COMPLETED;
                case "WORKFLOW_EXECUTION_FAILED" -> status = ExecutionStatus.FAILED;
                // ASSET_REGISTERED, STEP_SCHEDULED, etc. are intentionally not projected here
            }
        }

        // Resolve executionId from events if not set by WORKFLOW_EXECUTION_STARTED
        if (executionId == null && !events.isEmpty()) {
            executionId = events.get(0).aggregateId();
            tenantId = events.get(0).tenantId();
        }

        return new ExecutionSnapshot(
                executionId != null ? executionId : "unknown",
                tenantId != null ? tenantId : "unknown",
                workflowName != null ? workflowName : "unknown",
                workflowVersion,
                status,
                Collections.unmodifiableMap(completedStepOutputs),
                Collections.unmodifiableList(stepExecutionOrder),
                lastSequence
        );
    }

    private ExecutionSnapshot emptySnapshot() {
        return new ExecutionSnapshot(
                "unknown", "unknown", "unknown", 0,
                ExecutionStatus.PENDING,
                Collections.emptyMap(), Collections.emptyList(), 0
        );
    }

    private String payloadStr(com.hermes.replay.domain.DomainEvent event, String key) {
        Object v = event.payload().get(key);
        return v != null ? v.toString() : null;
    }

    private int payloadInt(com.hermes.replay.domain.DomainEvent event, String key) {
        Object v = event.payload().get(key);
        if (v instanceof Number n) return n.intValue();
        return 0;
    }
}
