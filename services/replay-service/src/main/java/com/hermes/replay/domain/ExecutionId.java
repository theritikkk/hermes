package com.hermes.replay.domain;

import java.util.UUID;

/**
 * Value object identifying a workflow execution.
 * Each replay produces a NEW ExecutionId — the original stream is never modified.
 */
public record ExecutionId(String value) {

    /**
     * Generates a new random ExecutionId.
     */
    public static ExecutionId generate() {
        return new ExecutionId(UUID.randomUUID().toString());
    }
}
