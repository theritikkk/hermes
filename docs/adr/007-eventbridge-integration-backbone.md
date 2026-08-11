# ADR-007: EventBridge as Integration Backbone

## Status

Accepted

## Context

After events append to the store, multiple consumers react: Step Functions (start/continue flows), projections (read models), future webhooks/billing. Point-to-point Lambda invokes don't scale fan-out and lack schema contracts.

## Decision

Use a **single EventBridge bus** (`hermes-events`) for integration events:

- Command handlers publish after successful append (see ADR-012 outbox).
- Rules route by `detail-type` (e.g., `WorkflowExecutionStarted`, `StepCompleted`).
- **`WorkflowExecutionStarted`  Step Functions** is a native EventBridge target (IAM role + input transformer), not a Lambda intermediary.
- **`StepCompleted` / terminal events  projection Lambdas** via separate rules.
- Event schemas registered in `shared/event-schemas/` and validated in CI.

**SNS removed**  EventBridge supports fan-out to multiple targets with filtering.

## Consequences

**Positive**

- Decoupled consumers; add projection without changing command handler.
- Schema registry discipline from day one.
- Built-in archive/replay to debug consumer issues.

**Negative**

- At-least-once delivery  all consumers must be idempotent.
- Slight latency vs direct invoke (acceptable for async platform).

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| SNS + SQS fan-out | Two systems; EventBridge filtering is sufficient |
| Direct Lambda invoke chain | Tight coupling; no schema contract surface |
| Lambda glue to StartExecution | Redundant; EventBridge supports Step Functions as a first-class target |
| Kinesis | Overkill ops for v1; shard management |
