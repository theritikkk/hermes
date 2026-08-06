package com.hermes.command.domain;

import org.springframework.util.Assert;

/**
 * Value object representing a Workflow Version.
 */
public record WorkflowVersion(String name, int version) {
    public WorkflowVersion {
        Assert.hasText(name, "Workflow name must not be blank");
        Assert.isTrue(version > 0, "Version must be greater than 0");
    }
}
