package com.hermes.command.domain.aggregate;

import java.time.Instant;
import java.util.Map;

/**
 * Record representing the state of a workflow step.
 */
public record StepState(
    String stepName,
    String status,
    Map<String, Object> output,
    String error,
    Instant completedAt
) {}
