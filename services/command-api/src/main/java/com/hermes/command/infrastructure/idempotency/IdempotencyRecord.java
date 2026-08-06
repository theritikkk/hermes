package com.hermes.command.infrastructure.idempotency;

import java.time.Instant;

/**
 * Record representing an idempotency state.
 */
public record IdempotencyRecord(
    String clientRequestId,
    String tenantId,
    String commandType,
    String aggregateId,
    String status, // PROCESSING, COMPLETED
    Object responseBody,
    Instant createdAt,
    Instant expiresAt
) {}
