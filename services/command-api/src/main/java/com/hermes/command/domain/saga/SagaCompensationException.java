package com.hermes.command.domain.saga;

/**
 * Thrown when a saga compensation step fails to execute.
 * Wraps the underlying cause for structured error propagation.
 */
public class SagaCompensationException extends RuntimeException {

    public SagaCompensationException(String message, Throwable cause) {
        super(message, cause);
    }
}
