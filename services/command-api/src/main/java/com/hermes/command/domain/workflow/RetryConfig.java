package com.hermes.command.domain.workflow;

/**
 * Retry configuration for a step.
 */
public record RetryConfig(
    int maxAttempts,
    int intervalSeconds,
    double backoffRate
) {}
