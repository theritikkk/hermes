package com.hermes.admin.infrastructure.persistence;

import com.hermes.admin.domain.WorkflowDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkflowDefinitionRepository extends JpaRepository<WorkflowDefinition, UUID> {
    Optional<WorkflowDefinition> findByNameAndVersionAndTenantId(String name, int version, UUID tenantId);
    List<WorkflowDefinition> findByNameAndStatus(String name, WorkflowDefinition.Status status);
    Optional<WorkflowDefinition> findTopByNameAndStatusOrderByVersionDesc(String name, WorkflowDefinition.Status status);
    List<WorkflowDefinition> findByName(String name);
}