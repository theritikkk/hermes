package com.hermes.command.domain.event;

/**
 * Types of domain events in the system.
 */
public enum DomainEventType {
    ASSET_REGISTERED,
    WORKFLOW_EXECUTION_STARTED,
    STEP_SCHEDULED,
    STEP_COMPLETED,
    STEP_FAILED,
    WORKFLOW_EXECUTION_COMPLETED,
    WORKFLOW_EXECUTION_FAILED,
    WORKFLOW_EXECUTION_REPLAY_STARTED
}
