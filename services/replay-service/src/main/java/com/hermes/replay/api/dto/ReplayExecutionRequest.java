package com.hermes.replay.api.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request to replay a workflow execution.
 *
 * <p>Supports three replay modes:
 * <ol>
 *   <li><b>Full replay</b> — omit {@code fromStep}, {@code replayToSequence}, and
 *       {@code replayToTimestamp}. The entire event stream is re-projected and
 *       all steps are re-dispatched.</li>
 *   <li><b>From-step replay</b> — set {@code fromStep}. All steps completed before
 *       this step are injected from cache; this step onwards are re-dispatched.</li>
 *   <li><b>Point-in-time replay</b> — set {@code replayToSequence} or
 *       {@code replayToTimestamp}. State is projected to the given boundary;
 *       steps after the boundary are re-dispatched.</li>
 * </ol>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReplayExecutionRequest {

    @NotBlank(message = "executionId is required")
    private String executionId;

    /** Optional. Re-dispatch only from this step; inject cached outputs for all prior completed steps. */
    private String fromStep;

    /** Optional. Time-travel by sequence number: project state at exactly this sequence. */
    private Integer replayToSequence;

    /** Optional. Time-travel by wall-clock time (ISO-8601). Project state at this timestamp. */
    private String replayToTimestamp;

    /** When true, completed steps before the replay boundary are skipped using cached outputs. */
    private boolean skipCompletedSteps = true;

    /** Human-readable reason for this replay, stored on the ReplayJob record. */
    private String reason;
}
