package com.hermes.command.domain.command;

/**
 * Command to register an asset.
 */
public record RegisterAssetCommand(
    String commandType,
    String assetId,
    String s3Key,
    String contentType,
    String workflowName,
    Integer workflowVersion,
    String clientRequestId
) {}
