package com.hermes.replay.infrastructure.security;

import com.hermes.replay.domain.TenantId;
import org.springframework.stereotype.Component;

/**
 * Spring bean wrapper for TenantContext to enable easier injection and testing.
 */
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
