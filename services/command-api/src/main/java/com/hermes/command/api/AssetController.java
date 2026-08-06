package com.hermes.command.api;

import com.hermes.command.api.dto.RegisterAssetRequest;
import com.hermes.command.application.handler.CommandResult;
import com.hermes.command.application.handler.RegisterAssetHandler;
import com.hermes.command.domain.command.RegisterAssetCommand;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/assets")
public class AssetController {

    private final RegisterAssetHandler handler;

    public AssetController(RegisterAssetHandler handler) {
        this.handler = handler;
    }

    @PostMapping
    public ResponseEntity<CommandResult> registerAsset(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody RegisterAssetRequest request) {
        
        String assetId = request.assetId() != null ? request.assetId() : UUID.randomUUID().toString();
        String clientRequestId = idempotencyKey != null ? idempotencyKey : UUID.randomUUID().toString();
        
        RegisterAssetCommand command = new RegisterAssetCommand(
                "RegisterAsset",
                assetId,
                request.s3Key(),
                request.contentType(),
                request.workflowName(),
                request.workflowVersion(),
                clientRequestId
        );
        
        CommandResult result = handler.handle(command);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(result);
    }
}
