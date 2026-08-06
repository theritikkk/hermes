# ADR-015: TransactWriteItems for Atomic Event Append

## Status

Accepted

## Context

Appending an event to the event store requires writing two separate records: a META row (updating the sequence or aggregate state) and an EVENT row (the actual event payload). Using two separate `PutItem` calls creates a failure window. If the META row advances but the EVENT row write fails, the stream is permanently corrupted as it will be missing an expected sequence number.

## Decision

Use a single **`TransactWriteItems`** call to write both the META and EVENT items atomically in DynamoDB.

## Consequences

**Positive**
- Stream integrity is guaranteed. Both the META and EVENT records succeed or fail together, preventing partial updates and stream corruption.

**Negative**
- 2× Write Capacity Unit (WCU) cost for every event append, which translates to ~$0.625/hour at 50k triggers/hour. This cost is deemed an acceptable insurance premium for absolute data integrity.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Single-table with embedded version | Cannot enforce sequence uniqueness cleanly without a separate item to track the sequence constraint. |
| DynamoDB Streams checkpointing | Does not prevent the initial corruption from happening in the event store. |
