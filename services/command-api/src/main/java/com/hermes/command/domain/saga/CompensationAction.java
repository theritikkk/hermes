package com.hermes.command.domain.saga;

/**
 * The compensating action to execute when a Saga step must be rolled back.
 *
 * <p>Each value describes what the platform must do in production to undo
 * the side effect of the corresponding forward step.
 */
public enum CompensationAction {

    /** Release a DynamoDB distributed lock held by this step. */
    RELEASE_LOCK,

    /** Delete an uploaded-but-unprocessed S3 object (e.g. raw asset). */
    DELETE_S3_ARTIFACT,

    /** Publish a WORKFLOW_EXECUTION_FAILED event to EventBridge. */
    NOTIFY_FAILURE,

    /** Decrement per-tenant quota counters reserved for this execution. */
    RELEASE_QUOTA,

    /** Remove a step's projected output from the DynamoDB read model. */
    REVERT_STEP_OUTPUT,

    /**
     * This step has no observable side effects and requires no compensation.
     * Validation-only steps typically use this.
     */
    NO_OP
}
