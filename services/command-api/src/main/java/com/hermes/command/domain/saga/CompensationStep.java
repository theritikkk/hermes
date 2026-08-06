package com.hermes.command.domain.saga;

import java.util.Collections;
import java.util.Map;

/**
 * Immutable domain model for a single compensation step.
 *
 * <p>A compensation step is the inverse of a forward step in a Saga. It
 * describes <em>what</em> action to take and carries <em>the context</em>
 * needed to execute it (e.g. the S3 key to delete, the lock resource to
 * release).
 *
 * @param order        monotonically increasing position of the <em>forward</em> step.
 *                     Compensation is executed in <strong>reverse</strong> (LIFO) order
 *                     by the {@link SagaManager}.
 * @param forStepName  name of the forward step this reverses.
 * @param action       the concrete platform action to perform.
 * @param context      key-value payload required by the action (e.g. {@code s3Key}).
 *                     Always returns an unmodifiable view.
 */
public record CompensationStep(
        int order,
        String forStepName,
        CompensationAction action,
        Map<String, Object> context
) {

    /** Canonical constructor — ensures context is never null. */
    public CompensationStep {
        context = context != null ? Collections.unmodifiableMap(context) : Collections.emptyMap();
    }

    /** Convenience factory for steps with no side-effect context. */
    public static CompensationStep noOp(int order, String forStepName) {
        return new CompensationStep(order, forStepName, CompensationAction.NO_OP, Collections.emptyMap());
    }
}
