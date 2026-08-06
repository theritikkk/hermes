package com.hermes.query.domain;

public record TenantId(String value) {
    public TenantId {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("TenantId cannot be blank");
        }
    }
}
