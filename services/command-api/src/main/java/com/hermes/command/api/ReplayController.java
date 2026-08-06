package com.hermes.command.api;

import com.hermes.command.api.dto.ReplayExecutionRequest;
import com.hermes.command.application.handler.CommandResult;
import com.hermes.command.application.handler.ReplayExecutionHandler;
import com.hermes.command.domain.command.ReplayExecutionCommand;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/executions")
public class ReplayController {

    private final ReplayExecutionHandler handler;

    public ReplayController(ReplayExecutionHandler handler) {
        this.handler = handler;
    }

    @PostMapping("/{executionId}/replay")
    public ResponseEntity<CommandResult> replayExecution(
            @PathVariable("executionId") String executionId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody ReplayExecutionRequest request) {

        String clientRequestId = idempotencyKey != null ? idempotencyKey : UUID.randomUUID().toString();

        ReplayExecutionCommand command = new ReplayExecutionCommand(
                "ReplayExecution",
                executionId,
                request.fromStep(),
                request.replayReason(),
                clientRequestId
        );

        CommandResult result = handler.handle(command);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(result);
    }
}
