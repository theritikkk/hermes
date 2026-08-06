package com.hermes.command.infrastructure.workflow;

import com.hermes.command.domain.workflow.WorkflowDefinition;

/**
 * Interface for loading workflow definitions.
 */
public interface WorkflowRegistry {
    WorkflowDefinition load(String name, int version);
}
