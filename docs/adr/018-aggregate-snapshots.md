# ADR-018: Aggregate Snapshots for High-Volume Executions

## Status

Accepted

## Context

As executions accumulate events, replaying 200+ events to process a single step completion becomes wasteful. At high volume, reconstructing aggregate state by folding across unbounded event histories becomes a scaling and latency bottleneck.

## Decision

Every 50 events (configurable via `SNAPSHOT_THRESHOLD`), the `snapshot-trigger` Lambda creates a `SNAP#` item in the DynamoDB event store table.

Aggregate loading starts from the latest snapshot and replays only the delta events:
- Read latest snapshot item (`SNAP#<sequence>`) from DynamoDB.
- Resume event stream loading from `snapshot.resumeFromSequence()`.
- Fold only subsequent delta events onto the snapshot state.

## Consequences

**Positive**

- Reduces aggregate replay cost and latency from $O(n\text{ total events})$ to $O(n\text{ delta events since last snapshot})$.
- Drastically reduces DynamoDB read capacity consumption for long-running workflows.

**Negative**

- Snapshot items must be explicitly versioned (with a `schemaVersion` field) for forward and backward schema compatibility.
- Adds snapshot trigger worker invocation overhead on every threshold boundary.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Reducing event granularity | Loses audit trail detail and fine-grained replay fidelity. |
| Caching aggregates in Redis | High cache invalidation complexity; introduces stateful Redis infrastructure without solving root replay unboundedness. |
