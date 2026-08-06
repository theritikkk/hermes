package com.hermes.command.api;

import com.hermes.command.application.handler.HumanGateHandler;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tasks")
public class ApprovalController {

    public record ApprovalDecisionRequest(
            String executionId,
            String reviewerId,
            String comment
    ) {}

    private final HumanGateHandler humanGateHandler;

    public ApprovalController(HumanGateHandler humanGateHandler) {
        this.humanGateHandler = humanGateHandler;
    }

    @PostMapping("/{taskId}/approve")
    public ResponseEntity<HumanGateHandler.ApprovalResult> approveTask(
            @PathVariable("taskId") String taskId,
            @RequestBody(required = false) ApprovalDecisionRequest req) {

        String executionId = req != null ? req.executionId() : "unknown";
        String reviewer = req != null ? req.reviewerId() : "operator";
        String comment = req != null ? req.comment() : "Approved via API";

        HumanGateHandler.ApprovalResult result = humanGateHandler.processApproval(taskId, executionId, reviewer, true, comment);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{taskId}/reject")
    public ResponseEntity<HumanGateHandler.ApprovalResult> rejectTask(
            @PathVariable("taskId") String taskId,
            @RequestBody(required = false) ApprovalDecisionRequest req) {

        String executionId = req != null ? req.executionId() : "unknown";
        String reviewer = req != null ? req.reviewerId() : "operator";
        String comment = req != null ? req.comment() : "Rejected via API";

        HumanGateHandler.ApprovalResult result = humanGateHandler.processApproval(taskId, executionId, reviewer, false, comment);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{taskId}")
    public ResponseEntity<HumanGateHandler.ApprovalResult> getTask(@PathVariable("taskId") String taskId) {
        HumanGateHandler.ApprovalResult result = humanGateHandler.getTaskResult(taskId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(result);
    }
}
