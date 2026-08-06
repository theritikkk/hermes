package com.hermes.replay.domain;

import java.util.UUID;

/**
 * Value object identifying a replay job.
 */
public record ReplayJobId(String value) {

    /**
     * Generates a new random ReplayJobId.
     */
    public static ReplayJobId generate() {
        return new ReplayJobId(UUID.randomUUID().toString());
    }
}
