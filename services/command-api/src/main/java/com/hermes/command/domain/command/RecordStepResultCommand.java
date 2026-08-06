package com.hermes.command.domain.command;

import java.util.Map;

/**
 * Command to record a step result.
 */
public record RecordStepResultCommand(
    String commandType,
    String executionId,
    String stepName,
    String status,
    Map<String, Object> output,
    String error,
    boolean retryable
) {}
