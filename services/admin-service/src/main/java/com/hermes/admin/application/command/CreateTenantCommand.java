package com.hermes.admin.application.command;

import com.hermes.admin.domain.Tenant;

public record CreateTenantCommand(
        String name,
        String slug,
        Tenant.Plan plan,
        String createdBy
) {}