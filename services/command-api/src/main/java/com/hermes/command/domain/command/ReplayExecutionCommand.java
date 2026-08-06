package com.hermes.command.domain.command;

/**
 * Command to replay an execution.
 */
public record ReplayExecutionCommand(
    String commandType,
    String executionId,
    String fromStep,
    String replayReason,
    String clientRequestId
) {}
