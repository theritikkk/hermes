package com.hermes.command.domain;

import org.springframework.util.Assert;

/**
 * Value object representing an Idempotency Key.
 */
public record IdempotencyKey(TenantId tenantId, String clientRequestId) {
    public IdempotencyKey {
        Assert.notNull(tenantId, "TenantId must not be null");
        Assert.hasText(clientRequestId, "Client request ID must not be blank");
    }

    public static IdempotencyKey of(TenantId tenantId, String clientRequestId) {
        return new IdempotencyKey(tenantId, clientRequestId);
    }
}
