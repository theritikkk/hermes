package com.hermes.query.application.handler;

import com.hermes.query.application.query.GetExecutionQuery;
import com.hermes.query.domain.ExecutionProjection;
import com.hermes.query.domain.TenantId;
import com.hermes.query.infrastructure.readmodel.ExecutionReadModel;
import com.hermes.query.infrastructure.security.TenantContextHolder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class GetExecutionHandler {

    private final ExecutionReadModel readModel;
    private final TenantContextHolder tenantContextHolder;

    public GetExecutionHandler(ExecutionReadModel readModel, TenantContextHolder tenantContextHolder) {
        this.readModel = readModel;
        this.tenantContextHolder = tenantContextHolder;
    }

    public ExecutionProjection handle(GetExecutionQuery query) {
        TenantId tenantId = tenantContextHolder.getTenantId();
        Optional<ExecutionProjection> projection = readModel.findById(tenantId, query.executionId());
        return projection.orElseThrow(() -> new NotFoundException("Execution not found: " + query.executionId()));
    }
}
