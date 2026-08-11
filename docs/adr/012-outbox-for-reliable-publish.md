# ADR-012: Outbox for Reliable Event Publish

## Status

Accepted

## Context

Command handlers must append to DynamoDB **and** publish to EventBridge. If the append succeeds but publish fails, projections and SFN never see the event  split-brain between store and consumers.

## Decision

Implement **transactional outbox** in the event store table:

- Each event row includes `publishedAt: null | ISO8601`.
- Command handler: conditional append event with `publishedAt = null`.
- Same Lambda (or dedicated `outbox-publisher` on schedule/stream): read unpublished events, publish to EventBridge, conditional update `publishedAt`.

Projections and SFN consume from EventBridge (at-least-once). Idempotent consumers handle duplicates.

Phase 1: inline publish after append with retry; outbox republisher Lambda as backup. Phase 3: DynamoDB Stream triggers publisher.

## Consequences

**Positive**

- No lost integration events under transient EventBridge failures.
- Republisher enables recovery without manual intervention.

**Negative**

- Small window of eventual publish latency.
- Must handle duplicate publishes (consumers idempotent  ADR-008).

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Publish before append | Events published for failed commands |
| EventBridge only, no store | Can't replay aggregates; not event sourcing |
| Two-phase commit across AWS | Not available natively |
