package com.hermes.command.api.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

/**
 * Request body for Record Step Result API.
 */
public record RecordStepResultRequest(
    @NotBlank(message = "Execution ID is required") String executionId,
    @NotBlank(message = "Step Name is required") String stepName,
    @NotBlank(message = "Status is required") String status,
    Map<String, Object> output,
    String error,
    boolean retryable
) {}
