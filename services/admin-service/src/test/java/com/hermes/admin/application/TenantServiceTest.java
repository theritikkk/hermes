package com.hermes.admin.application;

import com.hermes.admin.application.command.CreateTenantCommand;
import com.hermes.admin.domain.Tenant;
import com.hermes.admin.infrastructure.persistence.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TenantServiceTest {

    private TenantRepository repository;
    private TenantService service;

    @BeforeEach
    void setUp() {
        repository = mock(TenantRepository.class);
        service = new TenantService(repository);
    }

    @Test
    void createThrowsOnDuplicateSlug() {
        when(repository.save(any())).thenThrow(new DataIntegrityViolationException("duplicate"));
        
        CreateTenantCommand cmd = new CreateTenantCommand("T1", "t1", Tenant.Plan.STARTER, "user1");
        assertThrows(IllegalArgumentException.class, () -> service.create(cmd));
    }

    @Test
    void suspendChangesStatus() {
        UUID id = UUID.randomUUID();
        Tenant t = new Tenant();
        t.setId(id);
        t.setStatus(Tenant.Status.ACTIVE);
        
        when(repository.findById(id)).thenReturn(Optional.of(t));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Tenant res = service.suspend(id);
        
        assertEquals(Tenant.Status.SUSPENDED, res.getStatus());
    }
}