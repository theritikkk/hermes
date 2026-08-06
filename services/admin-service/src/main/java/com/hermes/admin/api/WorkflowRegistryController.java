package com.hermes.admin.api;

import com.hermes.admin.application.WorkflowDefinitionService;
import com.hermes.admin.application.command.RegisterWorkflowCommand;
import com.hermes.admin.domain.WorkflowDefinition;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/workflows")
public class WorkflowRegistryController {
    private final WorkflowDefinitionService workflowService;

    public WorkflowRegistryController(WorkflowDefinitionService workflowService) {
        this.workflowService = workflowService;
    }

    @PostMapping({"", "/"})
    public ResponseEntity<WorkflowDefinition> register(@RequestBody RegisterWorkflowCommand cmd) {
        WorkflowDefinition def = workflowService.register(cmd);
        return ResponseEntity.status(HttpStatus.CREATED).body(def);
    }

    @PostMapping("/{id}/activate")
    public ResponseEntity<WorkflowDefinition> activate(@PathVariable UUID id) {
        return ResponseEntity.ok(workflowService.activate(id));
    }

    @PostMapping("/{id}/deprecate")
    public ResponseEntity<WorkflowDefinition> deprecate(@PathVariable UUID id) {
        return ResponseEntity.ok(workflowService.deprecate(id));
    }

    @GetMapping({"", "/"})
    public ResponseEntity<List<WorkflowDefinition>> listWorkflows(@RequestParam String name) {
        return ResponseEntity.ok(workflowService.findByName(name));
    }
}