package com.hermes.query.api;

import com.hermes.query.application.handler.SearchService;
import com.hermes.query.domain.ExecutionProjection;
import com.hermes.query.infrastructure.readmodel.ListResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/search")
public class SearchController {

    private final SearchService searchService;

    public SearchController(SearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping
    public ResponseEntity<ListResult<ExecutionProjection>> search(
            @RequestParam(value = "q", required = false) String queryText,
            @RequestParam(value = "limit", defaultValue = "20") int limit) {

        ListResult<ExecutionProjection> result = searchService.searchExecutions(queryText, limit);
        return ResponseEntity.ok(result);
    }
}
