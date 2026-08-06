package com.hermes.query.infrastructure.security;

import com.hermes.query.domain.TenantId;

public class TenantContext {
    private final TenantId tenantId;
    private final String userId;
    private final String role;

    private static final ThreadLocal<TenantContext> CONTEXT = new ThreadLocal<>();

    private TenantContext(TenantId tenantId, String userId, String role) {
        this.tenantId = tenantId;
        this.userId = userId;
        this.role = role;
    }

    public static TenantContext set(TenantId tenantId, String userId, String role) {
        TenantContext ctx = new TenantContext(tenantId, userId, role);
        CONTEXT.set(ctx);
        return ctx;
    }

    public static TenantId getTenantId() {
        TenantContext ctx = CONTEXT.get();
        return ctx != null ? ctx.tenantId : null;
    }

    public static String getUserId() {
        TenantContext ctx = CONTEXT.get();
        return ctx != null ? ctx.userId : null;
    }

    public static void clear() {
        CONTEXT.remove();
    }
}
