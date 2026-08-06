package com.hermes.command.infrastructure.idempotency;

import com.hermes.command.domain.TenantId;
import java.util.Optional;

/**
 * Interface for idempotency storage.
 */
public interface IdempotencyStore {
    Optional<IdempotencyRecord> find(TenantId tenantId, String clientRequestId);
    boolean reserve(IdempotencyRecord record);
    void complete(TenantId tenantId, String clientRequestId, Object responseBody);
}
