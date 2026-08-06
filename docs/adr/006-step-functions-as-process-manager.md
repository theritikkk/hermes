# ADR-006: Step Functions as Process Manager

## Status

Accepted

## Context

Workflows require durable orchestration: parallel branches, timeouts, catch/retry, human wait states. Hand-rolled SQS state machines lack visibility and native retry semantics. Step Functions is the AWS-native durable workflow engine.

Hermes uses **event sourcing** for truth — Step Functions must not become a hidden database.

## Decision

Step Functions is a **process manager** that:

- Executes workflow ASL definitions versioned in `workflows/templates/`.
- **Started by EventBridge**, not by command-api: a rule on `WorkflowExecutionStarted` targets the state machine ARN directly with an input transformer mapping event payload → SFN input. IAM role on the rule grants `states:StartExecution`.
- Invokes **activity workers** (Lambda) with `{ executionId, stepName, tenantId, input }`.
- On activity success/failure, workers append domain events; SFN proceeds based on Task result.
- Does **not** store authoritative history — SFN execution history is operational only.

Replay starts a **new** SFN execution linked via `parentExecutionId` in `WorkflowExecutionReplayStarted` event.

## Consequences

**Positive**

- Visual execution graph in AWS console for ops.
- Native Retry/Catch/Choice/Parallel without custom code.
- Activity registry maps step names → Lambda ARNs.

**Negative**

- SFN state transition costs at high volume.
- ASL is JSON, not arbitrary code — complex logic stays in activities.
- Vendor coupling (acceptable given AWS constraint).

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| SQS-only chain | No free replay graph; reimplements SFN poorly |
| Temporal (self-hosted) | Violates no-server-ops constraint |
| Lambda calling StartExecution on WorkflowExecutionStarted | Extra moving part; silent failure if glue Lambda errors; EventBridge native SFN target is simpler |
