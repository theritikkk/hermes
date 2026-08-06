package com.hermes.command.domain.aggregate;

import com.hermes.command.domain.event.EventEnvelope;
import lombok.Getter;
import java.util.HashMap;
import java.util.Map;

/**
 * WorkflowExecution Aggregate.
 */
@Getter
public class WorkflowExecutionAggregate {
    public enum Status {
        PENDING, RUNNING, COMPLETED, FAILED
    }

    private String executionId;
    private String tenantId;
    private String workflowName;
    private int workflowVersion;
    private String assetId;
    private Status status = Status.PENDING;
    private final Map<String, StepState> steps = new HashMap<>();
    private int version = 0;

    public void apply(EventEnvelope event) {
        this.version = event.sequence();
        switch (event.eventType()) {
            case WORKFLOW_EXECUTION_STARTED -> {
                this.executionId = event.aggregateId();
                this.tenantId = event.tenantId();
                this.workflowName = (String) event.payload().get("workflowName");
                this.workflowVersion = (Integer) event.payload().get("workflowVersion");
                this.assetId = (String) event.payload().get("assetId");
                this.status = Status.RUNNING;
            }
            case STEP_COMPLETED -> {
                String stepName = (String) event.payload().get("stepName");
                @SuppressWarnings("unchecked")
                Map<String, Object> output = (Map<String, Object>) event.payload().get("output");
                this.steps.put(stepName, new StepState(stepName, "COMPLETED", output, null, event.occurredAt()));
            }
            case STEP_FAILED -> {
                String stepName = (String) event.payload().get("stepName");
                String error = (String) event.payload().get("error");
                this.steps.put(stepName, new StepState(stepName, "FAILED", null, error, event.occurredAt()));
            }
            case WORKFLOW_EXECUTION_COMPLETED -> this.status = Status.COMPLETED;
            case WORKFLOW_EXECUTION_FAILED -> this.status = Status.FAILED;
            default -> {} // Ignore other events for state building
        }
    }
}
