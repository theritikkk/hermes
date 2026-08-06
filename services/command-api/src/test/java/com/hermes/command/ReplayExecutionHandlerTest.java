package com.hermes.command;

import com.hermes.command.application.handler.CommandResult;
import com.hermes.command.application.handler.ReplayExecutionHandler;
import com.hermes.command.domain.TenantId;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.command.ReplayExecutionCommand;
import com.hermes.command.domain.event.DomainEventType;
import com.hermes.command.domain.event.EventEnvelope;
import com.hermes.command.infrastructure.eventstore.AppendEventInput;
import com.hermes.command.infrastructure.eventstore.AppendResult;
import com.hermes.command.infrastructure.eventstore.EventStore;
import com.hermes.command.infrastructure.idempotency.IdempotencyRecord;
import com.hermes.command.infrastructure.idempotency.IdempotencyStore;
import com.hermes.command.infrastructure.security.TenantContext;
import com.hermes.command.infrastructure.security.TenantContextHolder;
import com.hermes.command.infrastructure.workflow.InMemoryWorkflowRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ReplayExecutionHandlerTest {

    private EventStore eventStore;
    private IdempotencyStore idempotencyStore;
    private ReplayExecutionHandler handler;

    @BeforeEach
    void setUp() {
        eventStore = mock(EventStore.class);
        idempotencyStore = mock(IdempotencyStore.class);
        TenantContextHolder tenantContextHolder = new TenantContextHolder();
        InMemoryWorkflowRegistry workflowRegistry = new InMemoryWorkflowRegistry();

        TenantContext.set(new TenantId("tenant-test"), "user-1", "ADMIN");

        handler = new ReplayExecutionHandler(
                eventStore,
                idempotencyStore,
                workflowRegistry,
                tenantContextHolder
        );
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void testReplayExecutionSuccess() {
        String origExecId = "exec-123";
        String clientReqId = "req-456";

        when(idempotencyStore.find(any(), eq(clientReqId))).thenReturn(Optional.empty());
        when(idempotencyStore.reserve(any())).thenReturn(true);

        EventEnvelope startEvt = new EventEnvelope(
                "evt-1",
                DomainEventType.WORKFLOW_EXECUTION_STARTED,
                1,
                AggregateType.WORKFLOW_EXECUTION.name(),
                origExecId,
                "tenant-test",
                "corr-1",
                Instant.now(),
                1,
                Map.of("workflowName", "document-pipeline", "workflowVersion", 1, "assetId", "asset-1"),
                null
        );

        EventEnvelope step1Evt = new EventEnvelope(
                "evt-2",
                DomainEventType.STEP_COMPLETED,
                1,
                AggregateType.WORKFLOW_EXECUTION.name(),
                origExecId,
                "tenant-test",
                "corr-1",
                Instant.now(),
                2,
                Map.of("stepName", "validate", "output", Map.of("valid", true)),
                null
        );

        when(eventStore.loadStream(AggregateType.WORKFLOW_EXECUTION, origExecId))
                .thenReturn(List.of(startEvt, step1Evt));

        AppendResult dummyResult = new AppendResult(startEvt, false);
        when(eventStore.append(any())).thenReturn(dummyResult);

        ReplayExecutionCommand command = new ReplayExecutionCommand(
                "ReplayExecution",
                origExecId,
                "ocr",
                "re-run after fix",
                clientReqId
        );

        CommandResult result = handler.handle(command);

        assertTrue(result.accepted());
        assertEquals(origExecId, result.aggregateId());
        assertNotNull(result.executionId());
        assertNotEquals(origExecId, result.executionId());

        ArgumentCaptor<AppendEventInput> captor = ArgumentCaptor.forClass(AppendEventInput.class);
        verify(eventStore, times(2)).append(captor.capture());

        List<AppendEventInput> appended = captor.getAllValues();
        assertEquals(DomainEventType.WORKFLOW_EXECUTION_REPLAY_STARTED.name(), appended.get(0).eventType());
        assertEquals(DomainEventType.WORKFLOW_EXECUTION_STARTED.name(), appended.get(1).eventType());

        Map<String, Object> replayPayload = appended.get(0).payload();
        assertEquals(origExecId, replayPayload.get("parentExecutionId"));
        assertEquals("ocr", replayPayload.get("fromStep"));
    }

    @Test
    void testReplayExecutionNotFoundThrowsException() {
        when(idempotencyStore.find(any(), any())).thenReturn(Optional.empty());
        when(idempotencyStore.reserve(any())).thenReturn(true);
        when(eventStore.loadStream(any(), any())).thenReturn(List.of());

        ReplayExecutionCommand command = new ReplayExecutionCommand(
                "ReplayExecution",
                "missing-exec",
                null,
                "testing",
                "req-789"
        );

        assertThrows(IllegalArgumentException.class, () -> handler.handle(command));
    }
}
