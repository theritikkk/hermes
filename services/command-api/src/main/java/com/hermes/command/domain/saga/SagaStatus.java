package com.hermes.command.domain.saga;

/**
 * Lifecycle status of a {@link SagaExecution}.
 *
 * <p>Valid transitions:
 * <pre>
 *   RUNNING ──► COMPLETE       (all steps succeeded, saga finishes normally)
 *   RUNNING ──► COMPENSATING   (a step failed, compensation begins)
 *   COMPENSATING ──► COMPENSATED  (all compensation steps executed)
 * </pre>
 */
public enum SagaStatus {
    /** Saga is actively executing forward steps. */
    RUNNING,

    /** A step failed; compensation steps are being executed in LIFO order. */
    COMPENSATING,

    /** All compensation steps have executed; the saga is fully rolled back. */
    COMPENSATED,

    /** All forward steps succeeded and the saga completed normally. */
    COMPLETE
}
