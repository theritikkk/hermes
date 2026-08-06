package com.hermes.command.api;

import com.hermes.command.application.handler.BatchAssetHandler;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/assets")
public class BatchAssetController {

    private final BatchAssetHandler batchAssetHandler;

    public BatchAssetController(BatchAssetHandler batchAssetHandler) {
        this.batchAssetHandler = batchAssetHandler;
    }

    @PostMapping("/batch")
    public ResponseEntity<BatchAssetHandler.BatchRegistrationResponse> registerBatch(
            @RequestHeader(value = "X-Tenant-ID", defaultValue = "default-tenant") String tenantId,
            @RequestBody BatchAssetHandler.BatchRegistrationRequest request) {

        BatchAssetHandler.BatchRegistrationResponse response = batchAssetHandler.processBatch(tenantId, request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }
}
