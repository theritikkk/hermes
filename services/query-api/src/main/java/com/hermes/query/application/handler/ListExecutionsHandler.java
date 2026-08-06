package com.hermes.query.application.handler;

import com.hermes.query.application.query.ListExecutionsQuery;
import com.hermes.query.domain.ExecutionProjection;
import com.hermes.query.domain.TenantId;
import com.hermes.query.infrastructure.readmodel.ExecutionReadModel;
import com.hermes.query.infrastructure.readmodel.ListResult;
import com.hermes.query.infrastructure.security.TenantContextHolder;
import org.springframework.stereotype.Service;

@Service
public class ListExecutionsHandler {

    private final ExecutionReadModel readModel;
    private final TenantContextHolder tenantContextHolder;

    public ListExecutionsHandler(ExecutionReadModel readModel, TenantContextHolder tenantContextHolder) {
        this.readModel = readModel;
        this.tenantContextHolder = tenantContextHolder;
    }

    public ListResult<ExecutionProjection> handle(ListExecutionsQuery query) {
        TenantId tenantId = tenantContextHolder.getTenantId();
        return readModel.findByTenant(tenantId, query);
    }
}
