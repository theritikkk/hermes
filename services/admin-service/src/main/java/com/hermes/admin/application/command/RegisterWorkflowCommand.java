package com.hermes.admin.application.command;

import java.util.UUID;

public record RegisterWorkflowCommand(
        String name,
        String definitionJson,
        UUID tenantId,
        String createdBy
) {}