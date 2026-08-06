package com.hermes.query.infrastructure.readmodel;

import java.util.List;

public record ListResult<T>(
    List<T> items,
    String nextPageToken
) {}
