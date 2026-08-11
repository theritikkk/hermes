# ADR-011: Removed Components and Why

## Status

Accepted

## Context

v1 accumulated services and patterns that sounded impressive but duplicated responsibilities or lacked a v1 use case. Experienced backend design removes dead weight early.

## Decision

Remove or defer the following:

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `audit-service` | **Removed** | Event store is the audit log |
| `billing-service` (standalone) | **Deferred** | Usage projection off events in Phase 2 |
| `ingestion-service` (standalone) | **Merged**  `command-api` | Upload is `RegisterAsset` command |
| `search-service` (write path) | **Removed** | Projections write OpenSearch; `query-api` reads |
| SNS | **Removed** | EventBridge fan-out sufficient |
| SQS on every SFN step | **Default off** | SFNLambda direct; SQS only for AI backpressure (Phase 2) |
| Distributed locks | **Deferred** | No cross-aggregate lock requirement in Phase 12 |
| Plugin system | **Deferred** | Activity registry in config replaces speculative plugin API |
| Visual workflow builder | **Phase 4** | Emits ASL; not engineering core |
| ClamAV virus scan | **Phase 3** | Real need, but not load-bearing for pipeline proof |

## Consequences

**Positive**

- Fewer moving parts in Phase 1.
- Clear ownership: one bus, one event store, one command entry.

**Negative**

- Some features arrive later (webhooks, billing dashboards).
- Team must resist re-adding removed services without new ADR.

## Alternatives Considered

Keeping all v1 services "for completeness"  rejected as resume-driven development.
