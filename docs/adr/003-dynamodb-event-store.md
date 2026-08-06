# ADR-003: DynamoDB as Event Store

## Status

Accepted

## Context

The event store must support append-only writes at burst concurrency (Lambda scale), keyed lookups by aggregate (`executionId`), and optional streaming to projections. Postgres connection pools exhaust under bursty Lambda writers; self-managed Kafka is out of scope.

## Decision

Store domain events in a **DynamoDB single-table** design:

```
PK: AGG#WorkflowExecution#{executionId}
SK: EVT#{sequence}#{eventId}
Attributes: eventType, eventVersion, tenantId, correlationId, occurredAt, payload, publishedAt
```

GSI for tenant-scoped listings:

```
GSI1 PK: TENANT#{tenantId}#EXEC
GSI1 SK: {startedAt}
```

Optimistic concurrency via conditional put on `sequence` (expected version).

## Consequences

**Positive**

- On-demand scaling matches serverless burst pattern.
- Native DynamoDB Streams can trigger projections (Phase 2 option).
- Single-digit-ms reads for aggregate replay.

**Negative**

- No cross-aggregate transactions — sagas use choreography + compensating events.
- Event payload size limits (400KB item) — large outputs go to S3, event stores reference.
- Query patterns beyond designed GSIs require new GSIs or scan (avoid scans).

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| PostgreSQL event table | Connection pool pressure at Lambda concurrency |
| EventBridge as store | Not durable as SoR; no aggregate stream replay |
| S3 event log | No conditional append / concurrency control |
