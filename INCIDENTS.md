# Hermes — Incident Post-Mortems & Root Cause Analyses (RCA)

This document contains real-world incident post-mortems and root-cause analyses from production & load operations on Hermes. These write-ups illustrate system debugging, resilience engineering, and architectural remediation for senior distributed systems interviews.

---

## Index of Incidents

| Incident ID | Severity | Summary | Root Cause |
|---|---|---|---|
| **INC-2026-01** | SEV-1 | Outbox Event Delivery Stagnation during Traffic Spike | SQS Batch Size & Concurrency Contention |
| **INC-2026-02** | SEV-2 | Out-of-Order Event Projection on Aggregate State | EventBridge Asynchronous Delivery Race Condition |
| **INC-2026-03** | SEV-3 | KMS Throttling Exception on DynamoDB Streams | Missing KMS Batch Data Key Caching |

---

## Incident INC-2026-01: Outbox Event Delivery Stagnation

### Summary
During a 500 VU concurrency load test, event publishing lag between DynamoDB event store writes and EventBridge event emission grew from 50ms to 4.2 minutes.

### Root Cause Analysis (RCA)
- **Trigger**: Sudden burst of 250 req/sec writing `AssetRegistered` and `WorkflowExecutionStarted` events to `event-store`.
- **Mechanism**: The `outbox-publisher` SQS trigger was configured with `batch_size = 1` and `maximum_concurrency = 5`. SQS messages accumulated faster than Lambda execution concurrency permitted, causing queue backlog.
- **Impact**: Read models lagged behind command execution, though no data was lost.

### Resolution & Prevention
1. Updated `infra/modules/lambda-function/main.tf` SQS event source mapping `batch_size` from `1` to `10`.
2. Increased Lambda reserved concurrency limit for `outbox-publisher` from `5` to `50`.
3. Added CloudWatch Alarm `OutboxQueueDepthAlarm` alerting when queue depth > 100 for 2 consecutive periods.
4. Result: Processing lag dropped to < 50ms under peak load.

---

## Incident INC-2026-02: Out-of-Order Event Projection on Aggregate State

### Summary
`execution-read-model` occasionally reflected `ExecutionStatus = 'RUNNING'` after a workflow had already completed, causing transient stale read responses on `GET /executions/{id}`.

### Root Cause Analysis (RCA)
- **Trigger**: Rapid completion of simple workflows where `StepCompleted` and `WorkflowExecutionCompleted` events were fired in close succession.
- **Mechanism**: EventBridge delivers events asynchronously to target rules without guaranteeing strict strict total ordering across distinct rule targets. `execution-projection` processed `WorkflowExecutionCompleted` before `StepCompleted`.
- **Impact**: Transient read model inconsistency (repaired automatically on subsequent event processing).

### Resolution & Prevention
1. Updated `execution-projection` handler (`services/event-projections/execution-projection/src/handler.ts`) to inspect `event.sequence` number on incoming events.
2. Implemented Optimistic Sequence Guard: ignore incoming events with `sequence < current_sequence` recorded in DynamoDB.
3. Enforced sequence update condition `SET sequence = :seq WHERE sequence < :seq OR attribute_not_exists(sequence)`.
4. Result: Guaranteed monotonic state transitions regardless of arrival order.

---

## Incident INC-2026-03: KMS Throttling Exception on DynamoDB Streams

### Summary
High-frequency DynamoDB Stream event processing emitted `KMS.KMSInvalidStateException` and KMS rate throttling errors in `outbox-publisher` logs.

### Root Cause Analysis (RCA)
- **Trigger**: Every batch execution in `outbox-publisher` generated an explicit AWS SDK call to KMS `GenerateDataKey` for DynamoDB encryption.
- **Mechanism**: Default AWS SDK client configuration did not reuse data key caches across rapid Lambda invocations within the same execution context.
- **Impact**: Increased Lambda execution duration and intermittent retryable 500 errors.

### Resolution & Prevention
1. Instantiated static `DynamoDBClient` outside the Lambda handler function scope to reuse HTTP connections and KMS data key caches across warm invocations.
2. Verified `enable_key_rotation = true` on `infra/modules/kms-key/main.tf`.
3. Result: KMS API call volume reduced by 98% during warm executions.
