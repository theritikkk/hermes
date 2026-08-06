package com.hermes.command.domain;

import org.springframework.util.Assert;

/**
 * Value object representing a Tenant ID.
 */
public record TenantId(String value) {
    public TenantId {
        Assert.hasText(value, "Tenant ID must not be blank");
    }
}
