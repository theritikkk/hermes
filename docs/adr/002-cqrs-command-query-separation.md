# ADR-002: CQRS Command/Query Separation

## Status

Accepted

## Context

A single service that handles uploads, runs activities, and serves dashboard queries couples scaling profiles, encourages N+1 query patterns in write handlers, and makes it easy to accidentally leak write invariants into read paths (e.g., trusting client-supplied `tenantId` in a GET handler).

## Decision

Apply **CQRS explicitly**:

| Path | Entry | Writes | Reads |
|------|-------|--------|-------|
| Command | `command-api` | Append events, publish integration events | Ack only (`executionId`, `eventId`) |
| Query | `query-api` | None | Read models (DynamoDB, Postgres, OpenSearch) |

Projection Lambdas (`event-projections`) are the **only** writers to read models (except rebuild jobs).

## Consequences

**Positive**

- Read models optimized per query (GSI for failed executions, OpenSearch for text).
- Command handlers stay small and testable.
- Clear security boundary: query-api never appends events.

**Negative**

- Eventual consistency on reads — UI must tolerate short lag.
- More components than a monolith.
- Full projection rebuild is an operational procedure we must document and automate.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| CRUD with separate read replicas | Still one model; replay and audit remain bolted on |
| GraphQL single endpoint | Hides but doesn't remove coupling; mutations would still mix concerns |
