package com.hermes.replay.application;

/**
 * Thrown when an execution replay fails due to a corrupt event stream,
 * infrastructure error, or invalid replay parameters.
 */
public class ReplayException extends RuntimeException {

    public ReplayException(String message) {
        super(message);
    }

    public ReplayException(String message, Throwable cause) {
        super(message, cause);
    }
}
