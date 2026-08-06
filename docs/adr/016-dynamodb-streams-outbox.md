# ADR-016: DynamoDB Streams for Transactional Outbox

## Status

Accepted

## Context

Publishing an event directly to EventBridge inline after a DynamoDB write introduces a dual-write problem. If the DynamoDB write succeeds but the EventBridge publish fails (e.g., network timeout), the event is silently lost to downstream consumers.

## Decision

Implement the **Transactional Outbox** pattern via DynamoDB Streams → SQS → `outbox-publisher` Lambda → EventBridge → mark published.

The intermediate SQS queue is placed between DynamoDB Streams and the publisher Lambda because DynamoDB Streams records are not re-processed after a Lambda failure. SQS provides a Dead Letter Queue (DLQ), configurable retries, and visibility timeouts to ensure robust processing.

## Consequences

**Positive**
- Guaranteed at-least-once delivery of events to EventBridge.
- Survives transient network failures and EventBridge outages.

**Negative**
- Introduces approximately 100-500ms of additional projection lag. This is acceptable as CQRS read models are eventually consistent by design.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Saga orchestrator | Overkill for a simple event publishing mechanism. |
| EventBridge Pipes | Lacks Dead Letter Queue (DLQ) support natively on the DynamoDB Streams source. |
| Inline retry | Insufficient, as retries do not survive if the Lambda execution times out or crashes completely. |
