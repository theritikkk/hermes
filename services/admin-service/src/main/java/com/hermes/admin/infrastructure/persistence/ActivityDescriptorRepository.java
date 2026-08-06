package com.hermes.admin.infrastructure.persistence;

import com.hermes.admin.domain.ActivityDescriptor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActivityDescriptorRepository extends JpaRepository<ActivityDescriptor, UUID> {
    Optional<ActivityDescriptor> findByNameAndVersionAndTenantId(String name, int version, UUID tenantId);
    List<ActivityDescriptor> findByIsPlatformTrue();
}