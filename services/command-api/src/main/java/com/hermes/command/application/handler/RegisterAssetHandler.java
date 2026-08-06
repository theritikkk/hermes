package com.hermes.command.application.handler;

import com.hermes.command.domain.AssetId;
import com.hermes.command.domain.ExecutionId;
import com.hermes.command.domain.TenantId;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.aggregate.AssetAggregate;
import com.hermes.command.domain.command.RegisterAssetCommand;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Handler for RegisterAssetCommand.
 */
@Service
public class RegisterAssetHandler {

    // EventPublisher is intentionally absent.
    // Events are delivered to EventBridge via DynamoDB Streams → outbox-publisher Lambda.
    // Calling EventBridge inline here would create a dual-write: if EventBridge fails
    // after DynamoDB succeeds, the event is lost. The outbox pattern eliminates this.
    private final EventStore eventStore;
    private final IdempotencyStore idempotencyStore;
    private final WorkflowRegistry workflowRegistry;
    private final TenantContextHolder tenantContextHolder;

    public RegisterAssetHandler(
            EventStore eventStore,
            IdempotencyStore idempotencyStore,
            WorkflowRegistry workflowRegistry,
            TenantContextHolder tenantContextHolder) {
        this.eventStore = eventStore;
        this.idempotencyStore = idempotencyStore;
        this.workflowRegistry = workflowRegistry;
        this.tenantContextHolder = tenantContextHolder;
    }

    public CommandResult handle(RegisterAssetCommand command) {
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
                command.assetId(),
                "PROCESSING",
                null,
                Instant.now(),
                Instant.now().plus(24, ChronoUnit.HOURS)
        );
        
        if (!idempotencyStore.reserve(newRecord)) {
            throw new IllegalStateException("Could not reserve idempotency key");
        }

        List<EventEnvelope> stream = eventStore.loadStream(AggregateType.ASSET, command.assetId());
        AssetAggregate asset = DynamoDbEventStore.replayAggregate(stream, new AssetAggregate(), AssetAggregate::apply);
        
        if (asset.isRegistered()) {
            CommandResult result = new CommandResult(true, command.assetId(), null, true);
            idempotencyStore.complete(tenantId, command.clientRequestId(), result);
            return result;
        }

        String correlationId = UUID.randomUUID().toString();
        
        Map<String, Object> assetPayload = new HashMap<>();
        assetPayload.put("s3Key", command.s3Key());
        assetPayload.put("contentType", command.contentType());
        assetPayload.put("workflowName", command.workflowName());
        assetPayload.put("workflowVersion", command.workflowVersion());
        
        AppendResult assetAppendResult = eventStore.append(new AppendEventInput(
                AggregateType.ASSET,
                command.assetId(),
                tenantId.value(),
                correlationId,
                DomainEventType.ASSET_REGISTERED.name(),
                1,
                assetPayload,
                asset.getVersion()
        ));

        String executionId = ExecutionId.generate().toString();
        Map<String, Object> execPayload = new HashMap<>();
        execPayload.put("workflowName", command.workflowName());
        execPayload.put("workflowVersion", command.workflowVersion());
        execPayload.put("assetId", command.assetId());

        AppendResult execAppendResult = eventStore.append(new AppendEventInput(
                AggregateType.WORKFLOW_EXECUTION,
                executionId,
                tenantId.value(),
                correlationId,
                DomainEventType.WORKFLOW_EXECUTION_STARTED.name(),
                1,
                execPayload,
                0
        ));


        // No inline publish. DynamoDB Streams fires on the event items written above.
        // outbox-publisher Lambda picks them up and delivers to EventBridge.
        CommandResult result = new CommandResult(true, command.assetId(), executionId, false);
        idempotencyStore.complete(tenantId, command.clientRequestId(), result);

        return result;
    }
}
