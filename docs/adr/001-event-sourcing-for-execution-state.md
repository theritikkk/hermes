# ADR-001: Event Sourcing for Execution State

## Status

Accepted

## Context

Workflow executions generate many state transitions: steps scheduled, completed, failed, retried, replayed. Storing only "current status" in a row loses history, makes replay a bespoke reconstruction problem, and conflates operational logs with audit requirements.

Hermes must answer "what happened to execution X" months later and support replay from arbitrary steps with legally defensible audit trails.

## Decision

Use **event sourcing** for workflow execution (and asset registration) aggregates:

- The **event store** is the system of record.
- Current execution state is a **projection** derived from events.
- Commands validate against reconstructed aggregate state, then append new events.
- No in-place UPDATE of execution status as the authoritative record.

## Consequences

**Positive**

- Replay is first-class: re-read events, inject cached step outputs.
- Complete audit trail without a separate audit service.
- Projections can be rebuilt after schema changes.
- Time-travel debugging for operators.

**Negative**

- Event schema evolution requires `eventVersion` and upcasters.
- Streams grow unbounded — need archival policy (S3 export) for old executions.
- Developers must think in events, not CRUD — steeper onboarding.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Status table only (CRUD) | No native replay; audit is a second write path |
| CDC from status table | Events are derivative and lossy; ordering guarantees harder |
| Kafka as event store | Violates serverless-first constraint; ops overhead |
