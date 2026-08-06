package com.hermes.command.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for Replay Execution API.
 */
public record ReplayExecutionRequest(
    String fromStep,
    @NotBlank(message = "Replay reason is required") String replayReason
) {}
