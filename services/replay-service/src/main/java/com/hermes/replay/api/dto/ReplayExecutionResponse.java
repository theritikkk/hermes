package com.hermes.replay.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Result of a replay operation.
 *
 * <p>Contains the full delta between the original execution and the replayed
 * boundary, including which cached outputs were injected (so callers can
 * validate that step injection was correct) and which steps need re-dispatch.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReplayExecutionResponse {

    private String replayJobId;
    private String executionId;
    private String tenantId;
    private String status;

    /** Total number of events read from the event store for this replay. */
    private int eventsReplayed;

    /** Number of steps whose outputs were injected from cache (not re-dispatched). */
    private int stepsSkipped;

    /** Steps that must be re-dispatched to activity workers. */
    private List<String> replayedStepNames;

    /**
     * Cached outputs injected into the replay.
     * Key: step name. Value: the original step output payload.
     */
    private Map<String, Object> cachedOutputsInjected;

    /** Last projected sequence number of the event stream. */
    private int projectedToSequence;

    /** Human-readable message describing the replay outcome. */
    private String message;
}
