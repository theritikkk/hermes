package com.hermes.admin.infrastructure.security;

public class TenantContextHolder {
    public static String getTenantId() {
        return TenantContext.getTenantId();
    }
}