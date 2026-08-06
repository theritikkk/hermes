package com.hermes.command.domain;

import org.springframework.util.Assert;
import java.util.UUID;

/**
 * Value object representing an Execution ID.
 */
public record ExecutionId(UUID value) {
    public ExecutionId {
        Assert.notNull(value, "Execution ID must not be null");
    }

    public static ExecutionId generate() {
        return new ExecutionId(UUID.randomUUID());
    }
    
    public static ExecutionId fromString(String uuid) {
        return new ExecutionId(UUID.fromString(uuid));
    }
    
    @Override
    public String toString() {
        return value.toString();
    }
}
