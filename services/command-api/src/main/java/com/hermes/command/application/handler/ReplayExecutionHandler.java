package com.hermes.command.application.handler;

import com.hermes.command.domain.ExecutionId;
import com.hermes.command.domain.TenantId;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.aggregate.StepState;
import com.hermes.command.domain.aggregate.WorkflowExecutionAggregate;
import com.hermes.command.domain.command.ReplayExecutionCommand;
import com.hermes.command.domain.event.DomainEventType;
import com.hermes.command.domain.event.EventEnvelope;
import com.hermes.command.infrastructure.eventstore.AppendEventInput;
import com.hermes.command.infrastructure.eventstore.AppendResult;
import com.hermes.command.infrastructure.eventstore.DynamoDbEventStore;
import com.hermes.command.infrastructure.eventstore.EventStore;
import com.hermes.command.infrastructure.idempotency.IdempotencyRecord;
import com.hermes.command.infrastructure.idempotency.IdempotencyStore;
import com.hermes.command.infrastructure.security.TenantContextHolder;
import com.hermes.command.infrastructure.workflow.WorkflowRegistry;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Handler for ReplayExecutionCommand.
 */
@Service
public class ReplayExecutionHandler {

    private final EventStore eventStore;
    private final IdempotencyStore idempotencyStore;
    private final WorkflowRegistry workflowRegistry;
    private final TenantContextHolder tenantContextHolder;

    public ReplayExecutionHandler(
            EventStore eventStore,
            IdempotencyStore idempotencyStore,
            WorkflowRegistry workflowRegistry,
            TenantContextHolder tenantContextHolder) {
        this.eventStore = eventStore;
        this.idempotencyStore = idempotencyStore;
        this.workflowRegistry = workflowRegistry;
        this.tenantContextHolder = tenantContextHolder;
    }

    public CommandResult handle(ReplayExecutionCommand command) {
        TenantId tenantId = tenantContextHolder.getTenantId();

        Optional<IdempotencyRecord> existingRecord = idempotencyStore.find(tenantId, command.clientRequestId());
        if (existingRecord.isPresent()) {
            IdempotencyRecord record = existingRecord.get();
            if ("COMPLETED".equals(record.status()) && record.responseBody() instanceof CommandResult) {
                return (CommandResult) record.responseBody();
            }
            if ("PROCESSING".equals(record.status())) {
                throw new IllegalStateException("Command is already being processed");
            }
        }

        IdempotencyRecord newRecord = new IdempotencyRecord(
                command.clientRequestId(),
                tenantId.value(),
                command.commandType(),
                command.executionId(),
                "PROCESSING",
                null,
                Instant.now(),
                Instant.now().plus(24, ChronoUnit.HOURS)
        );

        if (!idempotencyStore.reserve(newRecord)) {
            throw new IllegalStateException("Could not reserve idempotency key");
        }

        List<EventEnvelope> stream = eventStore.loadStream(AggregateType.WORKFLOW_EXECUTION, command.executionId());
        if (stream.isEmpty()) {
            throw new IllegalArgumentException("Workflow execution not found: " + command.executionId());
        }

        WorkflowExecutionAggregate original = DynamoDbEventStore.replayAggregate(
                stream, new WorkflowExecutionAggregate(), WorkflowExecutionAggregate::apply);

        Map<String, Object> cachedOutputs = new HashMap<>();
        if (command.fromStep() != null) {
            for (Map.Entry<String, StepState> entry : original.getSteps().entrySet()) {
                if ("COMPLETED".equals(entry.getValue().status())) {
                    if (entry.getValue().output() != null) {
                        cachedOutputs.put(entry.getKey(), entry.getValue().output());
                    }
                }
            }
        }

        String newExecutionId = ExecutionId.generate().toString();
        String correlationId = UUID.randomUUID().toString();

        Map<String, Object> replayPayload = new HashMap<>();
        replayPayload.put("parentExecutionId", command.executionId());
        replayPayload.put("fromStep", command.fromStep());
        replayPayload.put("replayReason", command.replayReason());
        replayPayload.put("cachedOutputs", cachedOutputs);
        replayPayload.put("workflowName", original.getWorkflowName());
        replayPayload.put("workflowVersion", original.getWorkflowVersion());
        replayPayload.put("assetId", original.getAssetId());

        eventStore.append(new AppendEventInput(
                AggregateType.WORKFLOW_EXECUTION,
                newExecutionId,
                tenantId.value(),
                correlationId,
                DomainEventType.WORKFLOW_EXECUTION_REPLAY_STARTED.name(),
                1,
                replayPayload,
                0
        ));

        Map<String, Object> startPayload = new HashMap<>();
        startPayload.put("workflowName", original.getWorkflowName());
        startPayload.put("workflowVersion", original.getWorkflowVersion());
        startPayload.put("assetId", original.getAssetId());

        eventStore.append(new AppendEventInput(
                AggregateType.WORKFLOW_EXECUTION,
                newExecutionId,
                tenantId.value(),
                correlationId,
                DomainEventType.WORKFLOW_EXECUTION_STARTED.name(),
                1,
                startPayload,
                1
        ));

        CommandResult result = new CommandResult(true, original.getExecutionId(), newExecutionId, false);
        idempotencyStore.complete(tenantId, command.clientRequestId(), result);

        return result;
    }
}
