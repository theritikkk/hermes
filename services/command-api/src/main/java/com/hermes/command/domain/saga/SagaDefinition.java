package com.hermes.command.domain.saga;

import com.hermes.command.domain.workflow.StepDefinition;
import com.hermes.command.domain.workflow.WorkflowDefinition;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Maps each forward step in a workflow to its registered {@link CompensationStep}.
 *
 * <p>Built from a {@link WorkflowDefinition} via {@link #fromWorkflowDefinition(WorkflowDefinition)}.
 * Steps without an explicit compensation in the workflow definition default to
 * {@link CompensationAction#NO_OP}.
 *
 * <p>The core operation — {@link #getCompensationsFor(List)} — returns the compensation
 * steps for a given list of completed forward steps in <strong>strict LIFO order</strong>
 * (last completed step is compensated first).
 */
public class SagaDefinition {

    /**
     * Ordered map of step name → CompensationStep.
     * Order reflects the workflow step sequence (step-1 first, last-step last).
     */
    private final Map<String, CompensationStep> compensationsByStepName;

    private SagaDefinition(Map<String, CompensationStep> compensationsByStepName) {
        this.compensationsByStepName = Collections.unmodifiableMap(compensationsByStepName);
    }

    /**
     * Builds a {@code SagaDefinition} from a workflow definition.
     *
     * <p>Each step in the workflow's step list is assigned an {@code order} integer
     * (1-based) corresponding to its position in the workflow. If the step carries
     * a compensation step name in its definition, the action is inferred as
     * {@link CompensationAction#REVERT_STEP_OUTPUT}; otherwise {@link CompensationAction#NO_OP}.
     *
     * <p>In a real system, compensation actions would be registered explicitly in the
     * workflow DSL. The inference here provides a safe default.
     */
    public static SagaDefinition fromWorkflowDefinition(WorkflowDefinition workflowDefinition) {
        Map<String, CompensationStep> steps = new LinkedHashMap<>();
        AtomicInteger order = new AtomicInteger(1);

        for (StepDefinition stepDef : workflowDefinition.getSteps()) {
            CompensationAction action = stepDef.compensationStep().isPresent()
                    ? CompensationAction.REVERT_STEP_OUTPUT
                    : CompensationAction.NO_OP;

            Map<String, Object> ctx = stepDef.compensationStep()
                    .map(cs -> Map.<String, Object>of("compensationActivity", cs))
                    .orElseGet(Map::of);

            steps.put(stepDef.name(), new CompensationStep(order.getAndIncrement(), stepDef.name(), action, ctx));
        }

        return new SagaDefinition(steps);
    }

    /**
     * Returns compensation steps for the given completed forward steps,
     * in <strong>reverse completion order</strong> (LIFO).
     *
     * <p>Only steps that appear in both {@code completedSteps} and the saga's
     * registered compensations are included. Unregistered steps are silently skipped.
     *
     * @param completedSteps ordered list of step names in the order they completed
     * @return LIFO-ordered compensation steps (last-completed is first in returned list)
     */
    public List<CompensationStep> getCompensationsFor(List<String> completedSteps) {
        List<CompensationStep> result = new ArrayList<>();
        // Iterate in reverse to produce LIFO order
        for (int i = completedSteps.size() - 1; i >= 0; i--) {
            String stepName = completedSteps.get(i);
            CompensationStep compensation = compensationsByStepName.get(stepName);
            if (compensation != null) {
                result.add(compensation);
            }
        }
        return Collections.unmodifiableList(result);
    }

    /** Returns an unmodifiable view of all registered compensations, keyed by step name. */
    public Map<String, CompensationStep> getAllCompensations() {
        return compensationsByStepName;
    }

    /** Returns true if this saga has a registered (non-NO_OP) compensation for the given step. */
    public boolean hasCompensation(String stepName) {
        CompensationStep step = compensationsByStepName.get(stepName);
        return step != null && step.action() != CompensationAction.NO_OP;
    }
}
