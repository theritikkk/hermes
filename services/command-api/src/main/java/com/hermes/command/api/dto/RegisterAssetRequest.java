package com.hermes.command.api.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

/**
 * Request body for Register Asset API.
 */
public record RegisterAssetRequest(
    String assetId, // Optional, can be generated
    @NotBlank(message = "S3 Key is required") String s3Key,
    String contentType,
    String workflowName,
    Integer workflowVersion
) {}
