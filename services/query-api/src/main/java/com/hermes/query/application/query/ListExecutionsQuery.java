package com.hermes.query.application.query;

import com.hermes.query.domain.ExecutionStatus;

public record ListExecutionsQuery(
    ExecutionStatus status,
    int limit,
    String nextPageToken
) {
    public ListExecutionsQuery {
        if (limit <= 0) {
            limit = 20;
        }
        if (limit > 100) {
            limit = 100;
        }
    }
}
