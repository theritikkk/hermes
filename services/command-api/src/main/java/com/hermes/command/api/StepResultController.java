package com.hermes.command.api;

import com.hermes.command.api.dto.RecordStepResultRequest;
import com.hermes.command.application.handler.RecordStepResultHandler;
import com.hermes.command.domain.command.RecordStepResultCommand;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/step-results")
public class StepResultController {

    private final RecordStepResultHandler handler;

    public StepResultController(RecordStepResultHandler handler) {
        this.handler = handler;
    }

    @PostMapping
    public ResponseEntity<Void> recordStepResult(
            @Valid @RequestBody RecordStepResultRequest request) {
        
        RecordStepResultCommand command = new RecordStepResultCommand(
                "RecordStepResult",
                request.executionId(),
                request.stepName(),
                request.status(),
                request.output(),
                request.error(),
                request.retryable()
        );
        
        handler.handle(command);
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }
}
