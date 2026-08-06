package com.hermes.query.application.handler;

import com.hermes.query.domain.ExecutionProjection;
import com.hermes.query.domain.TenantId;
import com.hermes.query.infrastructure.readmodel.ExecutionReadModel;
import com.hermes.query.infrastructure.readmodel.ListResult;
import com.hermes.query.infrastructure.security.TenantContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class SearchService {

    private final ExecutionReadModel readModel;
    private final TenantContextHolder tenantContextHolder;

    public SearchService(ExecutionReadModel readModel, TenantContextHolder tenantContextHolder) {
        this.readModel = readModel;
        this.tenantContextHolder = tenantContextHolder;
    }

    public ListResult<ExecutionProjection> searchExecutions(String queryText, int limit) {
        TenantId tenantId = tenantContextHolder.getTenantId();

        // Query execution read model for tenant executions
        ListResult<ExecutionProjection> allExecutions = readModel.listExecutions(tenantId, null, limit > 0 ? limit * 2 : 50, null);

        if (queryText == null || queryText.isBlank()) {
            return allExecutions;
        }

        String lowerQuery = queryText.toLowerCase();
        List<ExecutionProjection> filtered = allExecutions.items().stream()
                .filter(e -> (e.getExecutionId() != null && e.getExecutionId().toLowerCase().contains(lowerQuery)) ||
                             (e.getAssetId() != null && e.getAssetId().toLowerCase().contains(lowerQuery)) ||
                             (e.getWorkflowName() != null && e.getWorkflowName().toLowerCase().contains(lowerQuery)) ||
                             (e.getStatus() != null && e.getStatus().name().toLowerCase().contains(lowerQuery)))
                .limit(limit > 0 ? limit : 20)
                .collect(Collectors.toList());

        return new ListResult<>(filtered, null);
    }
}
