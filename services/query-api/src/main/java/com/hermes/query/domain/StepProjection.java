package com.hermes.query.domain;

import java.util.Map;

public record StepProjection(
    String stepName,
    String status,
    Map<String, Object> output,
    String error,
    String completedAt
) {}
