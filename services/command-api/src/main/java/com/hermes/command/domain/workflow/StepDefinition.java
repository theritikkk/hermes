package com.hermes.command.domain.workflow;

import java.util.Optional;

/**
 * Definition of a step within a workflow.
 */
public record StepDefinition(
    String name,
    String activityName,
    int timeoutSeconds,
    Optional<RetryConfig> retryConfig,
    Optional<String> compensationStep
) {}
