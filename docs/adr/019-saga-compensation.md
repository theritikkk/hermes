# ADR-019: Saga Compensation for Multi-Step Workflows

## Status

Accepted

## Context

When a multi-step workflow fails permanently on step $N$, steps $1 \dots N-1$ may have already executed external side effects (e.g., reserved inventory, sent notifications, provisioned resources) that require programmatic rollback or compensation.

## Decision

Each `StepDefinition` optionally declares a `compensationLambdaArn`.

On permanent failure (retries exhausted or non-retryable error):
1. `RecordStepResultHandler` invokes `definition.compensationStep(stepName)`.
2. If a compensation step is defined, it emits a `CompensationTriggered` event.
3. Amazon EventBridge routes this event to the designated compensation Lambda worker.

## Consequences

**Positive**

- Provides structured asynchronous rollback for distributed saga steps.
- Decouples forward execution logic from compensating transaction handlers.

**Negative**

- Compensation is asynchronous and best-effort.
- If a compensation execution itself fails, the message lands in the DLQ and alerts operators; the system guarantees a compensation *attempt*, not guaranteed external completion.
- Idempotency for compensating operations remains the responsibility of individual activity worker implementors.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Two-Phase Commit (2PC) | Requires distributed lock coordination across autonomous microservices; incompatible with serverless Lambda boundaries. |
| Pure choreography-based saga | Difficult to trace globally; lacks centralized failure detection and auditability. |
