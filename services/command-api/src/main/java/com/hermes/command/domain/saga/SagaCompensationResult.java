package com.hermes.command.domain.saga;

import java.util.List;

/**
 * Snapshot of a completed saga compensation run.
 *
 * @param sagaId                 the saga execution identifier
 * @param executionId            the workflow execution that triggered this saga
 * @param stepsCompensated       number of forward steps that were rolled back
 * @param compensatedStepNames   ordered list of step names that were compensated (LIFO)
 * @param finalStatus            saga status after compensation ({@link SagaStatus#COMPENSATED})
 */
public record SagaCompensationResult(
        String sagaId,
        String executionId,
        int stepsCompensated,
        List<String> compensatedStepNames,
        SagaStatus finalStatus
) {}
