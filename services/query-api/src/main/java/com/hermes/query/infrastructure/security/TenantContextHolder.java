package com.hermes.query.infrastructure.security;

import com.hermes.query.domain.TenantId;
import org.springframework.stereotype.Component;

@Component
public class TenantContextHolder {

    public TenantId getTenantId() {
        TenantId tenantId = TenantContext.getTenantId();
        if (tenantId == null) {
            throw new IllegalStateException("Tenant context is not set");
        }
        return tenantId;
    }

    public String getUserId() {
        return TenantContext.getUserId();
    }
}
