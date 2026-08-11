# ADR-009: Workflow Definition Versioning

## Status

Accepted

## Context

Workflow definitions change over time. Mutating a definition in place breaks in-flight executions and makes audit ("which definition ran?") ambiguous.

## Decision

Workflow definitions are **immutable once published**:

- Identity: `{ workflowName, version }` e.g. `document-pipeline@1`.
- `WorkflowExecutionStarted` event records exact version.
- SFN state machine deployed per major version (`document-pipeline-v1`).
- Publishing v2 does not affect in-flight v1 executions.
- Phase 1: single version from repo JSON. Phase 2: Postgres `workflow_definitions` table.

Custom tenant workflows (Phase 3+) compile to ASL from a validated JSON DSL  still versioned.

## Consequences

**Positive**

- Deterministic replay  same version + same events = same path.
- Safe deploys  new uploads pick up latest active version via config.

**Negative**

- Multiple SFN state machines to maintain across versions.
- Migration path needed when deprecating old versions.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Mutable latest-only definition | Breaks in-flight; audit nightmare |
| Definition embedded in each event | Bloats event store; versioning still needed |
