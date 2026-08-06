package com.hermes.replay.domain;

/**
 * Lifecycle states of a replay job.
 */
public enum ReplayJobStatus {
    PENDING,
    RUNNING,
    COMPLETED,
    FAILED
}
