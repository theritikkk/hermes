# ADR-005: OpenSearch as Derived Search Index

## Status

Accepted (Phase 2)

## Context

Keyword and vector search over processed document text is a product requirement (F5) but not a source-of-truth concern. Losing the index must be recoverable without data loss.

## Decision

**OpenSearch** is a **CQRS read model** populated exclusively by `event-projections` on `StepCompleted` (embed/index) events. No command handler or activity writes directly to OpenSearch.

Rebuild procedure: replay relevant events from store (or re-read S3 processed outputs).

## Consequences

**Positive**

- Clear failure domain — index loss is reindex, not restore-from-backup crisis.
- Search tuning (kNN, analyzers) isolated from transactional stores.

**Negative**

- Additional cost and ops (OpenSearch domain).
- Eventual consistency between execution complete and searchable.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| pgvector in Postgres | Couples search load to config DB; weaker full-text at scale |
| DynamoDB only | No native full-text / kNN for product search surface |
