package com.hermes.admin.application;

import com.hermes.admin.api.NotFoundException;
import com.hermes.admin.application.command.CreateTenantCommand;
import com.hermes.admin.domain.Tenant;
import com.hermes.admin.infrastructure.persistence.TenantRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class TenantService {
    private final TenantRepository tenantRepository;

    public TenantService(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
    }

    public Tenant create(CreateTenantCommand cmd) {
        Tenant tenant = new Tenant();
        tenant.setName(cmd.name());
        tenant.setSlug(cmd.slug());
        tenant.setPlan(cmd.plan() != null ? cmd.plan() : Tenant.Plan.STARTER);
        tenant.setStatus(Tenant.Status.ACTIVE);
        tenant.setCreatedBy(cmd.createdBy());
        try {
            return tenantRepository.save(tenant);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException("Tenant with slug " + cmd.slug() + " already exists.");
        }
    }

    public Tenant findBySlug(String slug) {
        return tenantRepository.findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("Tenant not found with slug: " + slug));
    }

    public Tenant suspend(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new NotFoundException("Tenant not found"));
        tenant.setStatus(Tenant.Status.SUSPENDED);
        return tenantRepository.save(tenant);
    }

    public List<Tenant> listActive() {
        return tenantRepository.findByStatus(Tenant.Status.ACTIVE);
    }
}