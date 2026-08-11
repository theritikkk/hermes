Status: Accepted
Context: As executions accumulate events, replaying 200+ events to process a single step completion becomes wasteful. At high volume this is a scaling bottleneck.
Decision: Every 50 events (configurable via SNAPSHOT_THRESHOLD), the snapshot-trigger Lambda creates a SNAP# item in the event store table. Aggregate loading starts from the latest snapshot and replays only the delta events.
Consequences: Reduces aggregate replay cost from O(n events) to O(n events since last snapshot). Snapshot items must be versioned (schemaVersion field) for forward compatibility.
Alternatives: Reducing event granularity (rejected  would lose audit detail); Caching aggregates in Redis (rejected  cache invalidation complexity, adds Redis dependency without solving the root cause).
