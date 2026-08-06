package com.hermes.command.application.handler;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class HumanGateHandler {

    public record ApprovalResult(
            String taskId,
            String executionId,
            String status,
            String reviewerId,
            String comment
    ) {}

    private final Map<String, ApprovalResult> taskResults = new ConcurrentHashMap<>();

    public ApprovalResult processApproval(String taskId, String executionId, String reviewerId, boolean approved, String comment) {
        String status = approved ? "APPROVED" : "REJECTED";

        ApprovalResult result = new ApprovalResult(
                taskId,
                executionId,
                status,
                reviewerId != null ? reviewerId : "anonymous",
                comment != null ? comment : ""
        );

        taskResults.put(taskId, result);
        return result;
    }

    public ApprovalResult getTaskResult(String taskId) {
        return taskResults.get(taskId);
    }
}
