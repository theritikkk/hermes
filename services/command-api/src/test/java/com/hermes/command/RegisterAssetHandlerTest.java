package com.hermes.command;

import com.hermes.command.application.handler.CommandResult;
import com.hermes.command.application.handler.RegisterAssetHandler;
import com.hermes.command.domain.TenantId;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.command.RegisterAssetCommand;
import com.hermes.command.domain.event.DomainEventType;
import com.hermes.command.domain.event.EventEnvelope;
import com.hermes.command.infrastructure.eventstore.AppendEventInput;
import com.hermes.command.infrastructure.eventstore.AppendResult;
import com.hermes.command.infrastructure.eventstore.EventStore;
import com.hermes.command.infrastructure.idempotency.IdempotencyStore;
import com.hermes.command.infrastructure.publishing.EventPublisher;
import com.hermes.command.infrastructure.security.TenantContext;
import com.hermes.command.infrastructure.security.TenantContextHolder;
import com.hermes.command.infrastructure.workflow.WorkflowRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RegisterAssetHandlerTest {

    private EventStore eventStore;
    private EventPublisher eventPublisher;
    private IdempotencyStore idempotencyStore;
    private WorkflowRegistry workflowRegistry;
    private TenantContextHolder tenantContextHolder;
    private RegisterAssetHandler handler;

    @BeforeEach
    void setUp() {
        eventStore = mock(EventStore.class);
        eventPublisher = mock(EventPublisher.class);
        idempotencyStore = mock(IdempotencyStore.class);
        workflowRegistry = mock(WorkflowRegistry.class);
        tenantContextHolder = new TenantContextHolder();
        
        TenantContext.set(new TenantId("tenant-1"), "user-1", "user");

        handler = new RegisterAssetHandler(eventStore, eventPublisher, idempotencyStore, workflowRegistry, tenantContextHolder);
    }
    
    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void handle_NewAsset_Success() {
        RegisterAssetCommand cmd = new RegisterAssetCommand("Reg", "asset-1", "s3-key", "text", "wf", 1, "req-1");
        
        when(idempotencyStore.find(any(), anyString())).thenReturn(Optional.empty());
        when(idempotencyStore.reserve(any())).thenReturn(true);
        when(eventStore.loadStream(AggregateType.ASSET, "asset-1")).thenReturn(List.of());
        
        EventEnvelope evt1 = new EventEnvelope("e1", DomainEventType.ASSET_REGISTERED, 1, "ASSET", "asset-1", "tenant-1", "c1", Instant.now(), 1, Map.of(), null);
        EventEnvelope evt2 = new EventEnvelope("e2", DomainEventType.WORKFLOW_EXECUTION_STARTED, 1, "WORKFLOW_EXECUTION", "exec-1", "tenant-1", "c1", Instant.now(), 1, Map.of(), null);
        
        when(eventStore.append(any(AppendEventInput.class)))
                .thenReturn(new AppendResult(evt1, false))
                .thenReturn(new AppendResult(evt2, false));

        CommandResult result = handler.handle(cmd);
        
        assertTrue(result.accepted());
        assertEquals("asset-1", result.aggregateId());
        assertFalse(result.wasIdempotent());
        assertNotNull(result.executionId());
        
        verify(eventStore, times(2)).append(any(AppendEventInput.class));
        verify(eventPublisher, times(1)).publish(anyList());
        verify(idempotencyStore, times(1)).complete(any(), eq("req-1"), any());
    }
}
