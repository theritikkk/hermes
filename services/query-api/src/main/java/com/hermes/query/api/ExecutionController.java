package com.hermes.query.api;

import com.hermes.query.application.handler.GetExecutionHandler;
import com.hermes.query.application.handler.ListExecutionsHandler;
import com.hermes.query.application.query.GetExecutionQuery;
import com.hermes.query.application.query.ListExecutionsQuery;
import com.hermes.query.domain.ExecutionProjection;
import com.hermes.query.domain.ExecutionStatus;
import com.hermes.query.infrastructure.readmodel.ListResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/executions")
public class ExecutionController {

    private final GetExecutionHandler getExecutionHandler;
    private final ListExecutionsHandler listExecutionsHandler;

    public ExecutionController(GetExecutionHandler getExecutionHandler, ListExecutionsHandler listExecutionsHandler) {
        this.getExecutionHandler = getExecutionHandler;
        this.listExecutionsHandler = listExecutionsHandler;
    }

    @GetMapping("/{executionId}")
    public ResponseEntity<ExecutionProjection> getExecution(@PathVariable("executionId") String executionId) {
        ExecutionProjection projection = getExecutionHandler.handle(new GetExecutionQuery(executionId));
        return ResponseEntity.ok(projection);
    }

    @GetMapping
    public ResponseEntity<ListResult<ExecutionProjection>> listExecutions(
            @RequestParam(value = "status", required = false) ExecutionStatus status,
            @RequestParam(value = "limit", defaultValue = "20") int limit,
            @RequestParam(value = "nextPageToken", required = false) String nextPageToken) {

        ListExecutionsQuery query = new ListExecutionsQuery(status, limit, nextPageToken);
        ListResult<ExecutionProjection> result = listExecutionsHandler.handle(query);
        return ResponseEntity.ok(result);
    }
}
