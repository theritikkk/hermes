package com.hermes.admin.api;

import com.hermes.admin.application.TenantService;
import com.hermes.admin.application.command.CreateTenantCommand;
import com.hermes.admin.domain.Tenant;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/tenants")
public class TenantController {
    private final TenantService tenantService;

    public TenantController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    @PostMapping({"", "/"})
    public ResponseEntity<Tenant> create(@RequestBody CreateTenantCommand cmd) {
        Tenant tenant = tenantService.create(cmd);
        return ResponseEntity.status(HttpStatus.CREATED).body(tenant);
    }

    @GetMapping("/{slug}")
    public ResponseEntity<Tenant> getBySlug(@PathVariable String slug) {
        return ResponseEntity.ok(tenantService.findBySlug(slug));
    }

    @GetMapping({"", "/"})
    public ResponseEntity<List<Tenant>> listActive() {
        return ResponseEntity.ok(tenantService.listActive());
    }

    @PostMapping("/{id}/suspend")
    public ResponseEntity<Tenant> suspend(@PathVariable UUID id) {
        return ResponseEntity.ok(tenantService.suspend(id));
    }
}