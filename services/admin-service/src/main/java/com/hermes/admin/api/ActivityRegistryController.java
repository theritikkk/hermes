package com.hermes.admin.api;

import com.hermes.admin.application.ActivityRegistryService;
import com.hermes.admin.application.command.RegisterActivityCommand;
import com.hermes.admin.domain.ActivityDescriptor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/activities")
public class ActivityRegistryController {
    private final ActivityRegistryService activityService;

    public ActivityRegistryController(ActivityRegistryService activityService) {
        this.activityService = activityService;
    }

    @PostMapping({"", "/"})
    public ResponseEntity<ActivityDescriptor> register(@RequestBody RegisterActivityCommand cmd) {
        ActivityDescriptor desc = activityService.register(cmd);
        return ResponseEntity.status(HttpStatus.CREATED).body(desc);
    }

    @GetMapping({"", "/"})
    public ResponseEntity<List<ActivityDescriptor>> listPlatformActivities() {
        return ResponseEntity.ok(activityService.listPlatformActivities());
    }

    @GetMapping("/find")
    public ResponseEntity<ActivityDescriptor> findActivity(
            @RequestParam String name,
            @RequestParam int version,
            @RequestParam(required = false) UUID tenantId) {
        return activityService.findActivity(name, version, tenantId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}