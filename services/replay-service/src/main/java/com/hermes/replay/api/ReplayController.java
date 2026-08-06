package com.hermes.replay.api;

import com.hermes.replay.api.dto.ReplayExecutionRequest;
import com.hermes.replay.api.dto.ReplayExecutionResponse;
import com.hermes.replay.application.ReplayService;
import com.hermes.replay.infrastructure.security.TenantContextHolder;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/replay")
public class ReplayController {

    private final ReplayService replayService;
    private final TenantContextHolder tenantContextHolder;

    public ReplayController(ReplayService replayService, TenantContextHolder tenantContextHolder) {
        this.replayService = replayService;
        this.tenantContextHolder = tenantContextHolder;
    }

    @PostMapping
    public ResponseEntity<ReplayExecutionResponse> replayExecution(@Valid @RequestBody ReplayExecutionRequest request) {
        ReplayExecutionResponse response = replayService.replayExecution(request, tenantContextHolder.getTenantId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/executions/{executionId}")
    public ResponseEntity<ReplayExecutionResponse> replayExecutionById(
            @PathVariable("executionId") String executionId,
            @RequestBody(required = false) ReplayExecutionRequest request) {
        
        if (request == null) {
            request = new ReplayExecutionRequest();
        }
        request.setExecutionId(executionId);

        ReplayExecutionResponse response = replayService.replayExecution(request, tenantContextHolder.getTenantId());
        return ResponseEntity.ok(response);
    }
}
