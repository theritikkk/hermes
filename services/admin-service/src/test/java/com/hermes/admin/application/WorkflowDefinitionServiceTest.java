package com.hermes.admin.application;

import com.hermes.admin.application.command.RegisterWorkflowCommand;
import com.hermes.admin.domain.WorkflowDefinition;
import com.hermes.admin.infrastructure.persistence.WorkflowDefinitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WorkflowDefinitionServiceTest {

    private WorkflowDefinitionRepository repository;
    private WorkflowDefinitionService service;

    @BeforeEach
    void setUp() {
        repository = mock(WorkflowDefinitionRepository.class);
        service = new WorkflowDefinitionService(repository);
    }

    @Test
    void registerIncrementsVersion() {
        UUID tenantId = UUID.randomUUID();
        
        WorkflowDefinition v1 = new WorkflowDefinition();
        v1.setName("wf1");
        v1.setVersion(1);
        v1.setTenantId(tenantId);
        
        when(repository.findByName("wf1")).thenReturn(List.of(v1));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        RegisterWorkflowCommand cmd = new RegisterWorkflowCommand("wf1", "{}", tenantId, "user1");
        WorkflowDefinition res = service.register(cmd);

        assertEquals(2, res.getVersion());
        assertEquals(WorkflowDefinition.Status.DRAFT, res.getStatus());
    }

    @Test
    void activateDeprecatesExistingActive() {
        UUID id = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        
        WorkflowDefinition activeWf = new WorkflowDefinition();
        activeWf.setId(UUID.randomUUID());
        activeWf.setName("wf1");
        activeWf.setVersion(1);
        activeWf.setTenantId(tenantId);
        activeWf.setStatus(WorkflowDefinition.Status.ACTIVE);
        
        WorkflowDefinition draftWf = new WorkflowDefinition();
        draftWf.setId(id);
        draftWf.setName("wf1");
        draftWf.setVersion(2);
        draftWf.setTenantId(tenantId);
        draftWf.setStatus(WorkflowDefinition.Status.DRAFT);
        
        when(repository.findById(id)).thenReturn(Optional.of(draftWf));
        when(repository.findByNameAndStatus("wf1", WorkflowDefinition.Status.ACTIVE))
                .thenReturn(List.of(activeWf));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.activate(id);

        assertEquals(WorkflowDefinition.Status.DEPRECATED, activeWf.getStatus());
        assertEquals(WorkflowDefinition.Status.ACTIVE, draftWf.getStatus());
        verify(repository, times(2)).save(any(WorkflowDefinition.class));
    }
}