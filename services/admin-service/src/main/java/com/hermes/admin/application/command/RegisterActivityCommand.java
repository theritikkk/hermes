package com.hermes.admin.application.command;

import java.util.UUID;

public record RegisterActivityCommand(
        String name,
        int version,
        String runtime,
        String lambdaArn,
        int timeoutSeconds,
        String retryConfigJson,
        String compensationLambdaArn,
        String inputSchemaJson,
        String outputSchemaJson,
        boolean isPlatform,
        UUID tenantId,
        String createdBy
) {}