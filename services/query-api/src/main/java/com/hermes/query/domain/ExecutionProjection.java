package com.hermes.query.domain;

import java.util.Map;

public record ExecutionProjection(
    String executionId,
    String tenantId,
    String workflowName,
    Integer workflowVersion,
    String assetId,
    String s3Key,
    ExecutionStatus status,
    Map<String, StepProjection> steps,
    String startedAt,
    String completedAt,
    String failureReason,
    String updatedAt
) {}
