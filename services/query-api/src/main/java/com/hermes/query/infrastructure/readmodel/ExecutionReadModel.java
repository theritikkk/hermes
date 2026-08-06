package com.hermes.query.infrastructure.readmodel;

import com.hermes.query.application.query.ListExecutionsQuery;
import com.hermes.query.domain.ExecutionProjection;
import com.hermes.query.domain.TenantId;

import java.util.Optional;

public interface ExecutionReadModel {
    Optional<ExecutionProjection> findById(TenantId tenantId, String executionId);
    ListResult<ExecutionProjection> findByTenant(TenantId tenantId, ListExecutionsQuery query);
}
