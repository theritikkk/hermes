# ADR-004: PostgreSQL for Configuration

## Status

Accepted (Phase 2 full deployment; Phase 1 uses hardcoded workflow template)

## Context

Workflow definitions, org/user data, activity registry, and AI gateway config are relational, low-volume, and require ACID transactions (e.g., publish definition + deactivate prior version atomically).

## Decision

**PostgreSQL (RDS)** owns all configuration and reference data. It is **never** the execution event store.

Phase 1 exception: `document-pipeline-v1` loaded from repo JSON; no Postgres dependency until Phase 2.

## Consequences

**Positive**

- Natural fit for versioned definitions, FK constraints, RLS for tenant isolation.
- Read replicas serve heavy dashboard queries without touching write path.

**Negative**

- Another store to operate (mitigated: low write volume, managed RDS).
- Projections must sync definition metadata if needed on read model (cache invalidation).

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| DynamoDB for config | Poor fit for relational queries and multi-row transactions |
| Config in Parameter Store only | No relational integrity; awkward for workflow definition graphs |
