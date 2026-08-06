package com.hermes.replay.application;

import com.hermes.replay.api.dto.ReplayExecutionRequest;
import com.hermes.replay.api.dto.ReplayExecutionResponse;
import com.hermes.replay.domain.DomainEvent;
import com.hermes.replay.domain.TenantId;
import com.hermes.replay.infrastructure.eventstore.DynamoDbEventStoreReader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class ReplayServiceTest {

    private DynamoDbEventStoreReader eventStoreReader;
    private ReplayService replayService;

    @BeforeEach
    void setUp() {
        eventStoreReader = mock(DynamoDbEventStoreReader.class);
        replayService = new ReplayService(eventStoreReader);
    }

    @Test
    void testReplayExecutionSuccess() {
        DomainEvent event1 = new DomainEvent(
                "evt-1", "WORKFLOW_EXECUTION_STARTED", "EXECUTION", "exec-123",
                "tenant-1", "corr-1", Instant.now(), 1, Map.of("workflowName", "doc-pipeline")
        );
        DomainEvent event2 = new DomainEvent(
                "evt-2", "STEP_COMPLETED", "EXECUTION", "exec-123",
                "tenant-1", "corr-1", Instant.now(), 2, Map.of("stepName", "validate")
        );

        when(eventStoreReader.loadEventStream(anyString(), eq("exec-123")))
                .thenReturn(List.of(event1, event2));

        ReplayExecutionRequest request = new ReplayExecutionRequest("exec-123", null, true, "Testing replay");
        TenantId tenantId = new TenantId("tenant-1");

        ReplayExecutionResponse response = replayService.replayExecution(request, tenantId);

        assertNotNull(response);
        assertEquals("exec-123", response.getExecutionId());
        assertEquals("tenant-1", response.getTenantId());
        assertEquals("COMPLETED", response.getStatus());
        assertEquals(2, response.getEventsReplayed());
        assertEquals(1, response.getStepsSkipped());
        assertTrue(response.getReplayedStepNames().contains("validate"));
    }
}
