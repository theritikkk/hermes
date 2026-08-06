package com.hermes.admin.application;

import com.hermes.admin.api.NotFoundException;
import com.hermes.admin.application.command.RegisterWorkflowCommand;
import com.hermes.admin.domain.WorkflowDefinition;
import com.hermes.admin.infrastructure.persistence.WorkflowDefinitionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class WorkflowDefinitionService {
    private final WorkflowDefinitionRepository repository;

    public WorkflowDefinitionService(WorkflowDefinitionRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public WorkflowDefinition register(RegisterWorkflowCommand cmd) {
        WorkflowDefinition latest = repository.findTopByNameAndStatusOrderByVersionDesc(cmd.name(), WorkflowDefinition.Status.ACTIVE)
                .orElse(null);
        int nextVersion = 1;
        
        List<WorkflowDefinition> existing = repository.findByName(cmd.name());
        for (WorkflowDefinition def : existing) {
            if ((cmd.tenantId() == null && def.getTenantId() == null) ||
                (cmd.tenantId() != null && cmd.tenantId().equals(def.getTenantId()))) {
                if (def.getVersion() >= nextVersion) {
                    nextVersion = def.getVersion() + 1;
                }
            }
        }

        WorkflowDefinition def = new WorkflowDefinition();
        def.setName(cmd.name());
        def.setVersion(nextVersion);
        def.setDefinition(cmd.definitionJson());
        def.setTenantId(cmd.tenantId());
        def.setStatus(WorkflowDefinition.Status.DRAFT);
        def.setCreatedBy(cmd.createdBy());
        return repository.save(def);
    }

    @Transactional
    public WorkflowDefinition activate(UUID id) {
        WorkflowDefinition def = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
                
        List<WorkflowDefinition> existing = repository.findByNameAndStatus(def.getName(), WorkflowDefinition.Status.ACTIVE);
        for (WorkflowDefinition active : existing) {
             if ((def.getTenantId() == null && active.getTenantId() == null) ||
                 (def.getTenantId() != null && def.getTenantId().equals(active.getTenantId()))) {
                 if (!active.getId().equals(def.getId())) {
                     active.setStatus(WorkflowDefinition.Status.DEPRECATED);
                     repository.save(active);
                 }
             }
        }
        
        def.setStatus(WorkflowDefinition.Status.ACTIVE);
        return repository.save(def);
    }

    public WorkflowDefinition deprecate(UUID id) {
        WorkflowDefinition def = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        def.setStatus(WorkflowDefinition.Status.DEPRECATED);
        return repository.save(def);
    }

    public Optional<WorkflowDefinition> findLatestActive(String name) {
        return repository.findTopByNameAndStatusOrderByVersionDesc(name, WorkflowDefinition.Status.ACTIVE);
    }

    public WorkflowDefinition findByNameAndVersion(String name, int version, UUID tenantId) {
        return repository.findByNameAndVersionAndTenantId(name, version, tenantId)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
    }
    
    public List<WorkflowDefinition> findByName(String name) {
        return repository.findByName(name);
    }
}