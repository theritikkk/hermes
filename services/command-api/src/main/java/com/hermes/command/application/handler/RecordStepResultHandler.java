package com.hermes.command.application.handler;

import com.hermes.command.domain.TenantId;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.aggregate.StepState;
import com.hermes.command.domain.aggregate.WorkflowExecutionAggregate;
import com.hermes.command.domain.command.RecordStepResultCommand;
import com.hermes.command.domain.event.DomainEventType;
import com.hermes.command.domain.event.EventEnvelope;
import com.hermes.command.domain.workflow.WorkflowDefinition;
import com.hermes.command.infrastructure.eventstore.AppendEventInput;
import com.hermes.command.infrastructure.eventstore.AppendResult;
import com.hermes.command.infrastructure.eventstore.DynamoDbEventStore;
import com.hermes.command.infrastructure.eventstore.EventStore;
import com.hermes.command.infrastructure.security.TenantContextHolder;
import com.hermes.command.infrastructure.workflow.WorkflowRegistry;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Handler for RecordStepResultCommand.
 */
@Service
public class RecordStepResultHandler {

    // EventPublisher intentionally absent — see RegisterAssetHandler for rationale.
    // Delivery via DynamoDB Streams → outbox-publisher Lambda → EventBridge.
    private final EventStore eventStore;
    private final WorkflowRegistry workflowRegistry;
    private final TenantContextHolder tenantContextHolder;

    public RecordStepResultHandler(
            EventStore eventStore,
            WorkflowRegistry workflowRegistry,
            TenantContextHolder tenantContextHolder) {
        this.eventStore = eventStore;
        this.workflowRegistry = workflowRegistry;
        this.tenantContextHolder = tenantContextHolder;
    }

    public void handle(RecordStepResultCommand command) {
        TenantId tenantId = tenantContextHolder.getTenantId();

        List<EventEnvelope> stream = eventStore.loadStream(AggregateType.WORKFLOW_EXECUTION, command.executionId());
        if (stream.isEmpty()) {
            throw new IllegalArgumentException("Workflow execution not found");
        }

        WorkflowExecutionAggregate aggregate = DynamoDbEventStore.replayAggregate(stream, new WorkflowExecutionAggregate(), WorkflowExecutionAggregate::apply);
        
        // Idempotency check: if step already has same status, do nothing
        if (aggregate.getSteps().containsKey(command.stepName())) {
            StepState stepState = aggregate.getSteps().get(command.stepName());
            if (command.status().equals(stepState.status())) {
                return;
            }
        }

        // correlationId links all events for this execution. Extract from the stream
        // rather than accepting it from the caller — callers cannot influence the correlation chain.
        String correlationId = stream.get(0).correlationId();

        WorkflowDefinition definition = workflowRegistry.load(aggregate.getWorkflowName(), aggregate.getWorkflowVersion());

        int expectedVersion = aggregate.getVersion();

        Map<String, Object> payload = new HashMap<>();
        payload.put("stepName", command.stepName());
        
        boolean isCompleted = "COMPLETED".equals(command.status());
        DomainEventType stepEventType = isCompleted ? DomainEventType.STEP_COMPLETED : DomainEventType.STEP_FAILED;

        if (isCompleted && command.output() != null) {
            payload.put("output", command.output());
        } else if (!isCompleted && command.error() != null) {
            payload.put("error", command.error());
        }

        eventStore.append(new AppendEventInput(
                AggregateType.WORKFLOW_EXECUTION,
                command.executionId(),
                tenantId.value(),
                correlationId,
                stepEventType.name(),
                1,
                payload,
                expectedVersion++
        ));

        if (isCompleted && definition.isTerminalStep(command.stepName())) {
            eventStore.append(new AppendEventInput(
                    AggregateType.WORKFLOW_EXECUTION,
                    command.executionId(),
                    tenantId.value(),
                    correlationId,
                    DomainEventType.WORKFLOW_EXECUTION_COMPLETED.name(),
                    1,
                    Map.of(),
                    expectedVersion++
            ));
        } else if (!isCompleted && !command.retryable()) {
            Optional<String> compStep = definition.compensationStep(command.stepName());
            if (compStep.isEmpty()) {
                eventStore.append(new AppendEventInput(
                        AggregateType.WORKFLOW_EXECUTION,
                        command.executionId(),
                        tenantId.value(),
                        correlationId,
                        DomainEventType.WORKFLOW_EXECUTION_FAILED.name(),
                        1,
                        Map.of("reason", "Step failed with no compensation defined: " + command.stepName()),
                        expectedVersion
                ));
            }
        }
        // No inline publish. DynamoDB Streams fires on appended events.
    }
}
