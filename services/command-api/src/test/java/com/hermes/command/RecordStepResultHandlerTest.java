package com.hermes.command;

import com.hermes.command.application.handler.RecordStepResultHandler;
import com.hermes.command.domain.TenantId;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.command.RecordStepResultCommand;
import com.hermes.command.domain.event.DomainEventType;
import com.hermes.command.domain.event.EventEnvelope;
import com.hermes.command.domain.workflow.WorkflowDefinition;
import com.hermes.command.infrastructure.eventstore.AppendEventInput;
import com.hermes.command.infrastructure.eventstore.AppendResult;
import com.hermes.command.infrastructure.eventstore.EventStore;
import com.hermes.command.infrastructure.publishing.EventPublisher;
import com.hermes.command.infrastructure.security.TenantContext;
import com.hermes.command.infrastructure.security.TenantContextHolder;
import com.hermes.command.infrastructure.workflow.WorkflowRegistry;
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

class RecordStepResultHandlerTest {

    private EventStore eventStore;
    private EventPublisher eventPublisher;
    private WorkflowRegistry workflowRegistry;
    private TenantContextHolder tenantContextHolder;
    private RecordStepResultHandler handler;

    @BeforeEach
    void setUp() {
        eventStore = mock(EventStore.class);
        eventPublisher = mock(EventPublisher.class);
        workflowRegistry = mock(WorkflowRegistry.class);
        tenantContextHolder = new TenantContextHolder();
        
        TenantContext.set(new TenantId("tenant-1"), "user-1", "user");

        handler = new RecordStepResultHandler(eventStore, eventPublisher, workflowRegistry, tenantContextHolder);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void handle_TerminalStepCompleted_Success() {
        RecordStepResultCommand cmd = new RecordStepResultCommand("StepRes", "exec-1", "classify", "COMPLETED", Map.of(), null, false);
        
        EventEnvelope startEvt = new EventEnvelope("e1", DomainEventType.WORKFLOW_EXECUTION_STARTED, 1, "WORKFLOW_EXECUTION", "exec-1", "tenant-1", "c1", Instant.now(), 1, Map.of("workflowName", "document-pipeline", "workflowVersion", 1), null);
        when(eventStore.loadStream(AggregateType.WORKFLOW_EXECUTION, "exec-1")).thenReturn(List.of(startEvt));
        
        WorkflowDefinition def = WorkflowDefinition.documentPipelineV1();
        when(workflowRegistry.load("document-pipeline", 1)).thenReturn(def);

        EventEnvelope stepCompletedEvt = new EventEnvelope("e2", DomainEventType.STEP_COMPLETED, 1, "WORKFLOW_EXECUTION", "exec-1", "tenant-1", "c1", Instant.now(), 2, Map.of(), null);
        EventEnvelope wfCompletedEvt = new EventEnvelope("e3", DomainEventType.WORKFLOW_EXECUTION_COMPLETED, 1, "WORKFLOW_EXECUTION", "exec-1", "tenant-1", "c1", Instant.now(), 3, Map.of(), null);
        
        when(eventStore.append(any(AppendEventInput.class)))
                .thenReturn(new AppendResult(stepCompletedEvt, false))
                .thenReturn(new AppendResult(wfCompletedEvt, false));

        handler.handle(cmd);

        ArgumentCaptor<AppendEventInput> captor = ArgumentCaptor.forClass(AppendEventInput.class);
        verify(eventStore, times(2)).append(captor.capture());
        
        List<AppendEventInput> inputs = captor.getAllValues();
        assertEquals(DomainEventType.STEP_COMPLETED.name(), inputs.get(0).eventType());
        assertEquals(DomainEventType.WORKFLOW_EXECUTION_COMPLETED.name(), inputs.get(1).eventType());
        
        verify(eventPublisher, times(1)).publish(anyList());
    }
}
