package com.hermes.command.application.handler;

/**
 * Command result record.
 */
public record CommandResult(
    boolean accepted,
    String aggregateId,
    String executionId,
    boolean wasIdempotent
) {}
