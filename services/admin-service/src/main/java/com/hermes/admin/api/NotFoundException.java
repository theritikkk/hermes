package com.hermes.admin.api;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}