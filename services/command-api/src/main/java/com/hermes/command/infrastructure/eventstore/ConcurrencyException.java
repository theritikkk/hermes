package com.hermes.command.infrastructure.eventstore;

/**
 * Exception thrown when a concurrency conflict occurs while appending to the event store.
 */
public class ConcurrencyException extends RuntimeException {
    public ConcurrencyException(String message) {
        super(message);
    }
}
