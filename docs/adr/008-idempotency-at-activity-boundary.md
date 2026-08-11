# ADR-008: Idempotency at Activity Boundary

## Status

Accepted

## Context

EventBridge, SQS, Lambda, and Step Functions all deliver **at least once**. Retries without idempotency duplicate OCR runs, AI spend, and index writes.

## Decision

Every activity worker enforces idempotency with key `(executionId, stepName)`:

1. Check execution read model / idempotency table for completed step.
2. If complete  return cached output (short-circuit).
3. If in progress  optional lock via conditional write (Phase 1: rely on SFN serial step execution).
4. On success  append `StepCompleted` event with output reference (S3 for large payloads).

Command handlers use `(commandId)` or `(tenantId, clientRequestId)` for idempotent command acceptance.

## Consequences

**Positive**

- Safe retries at every layer.
- Cached outputs enable replay without re-running expensive steps.

**Negative**

- Must store step outputs addressable for replay (S3 + pointer in event).
- Idempotency table adds read before write latency (~single-digit ms).

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Exactly-once Kafka | Not in serverless stack |
| Trust SFN "RunJob" once | Lambda retries still duplicate |
| Distributed locks (Redis) | Premature; serial steps sufficient for Phase 1 |
