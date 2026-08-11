# Hermes Platform  Senior & Principal Engineer Interview Cheat Sheet

This document contains high-yield Q&A scenarios designed for Staff / Principal / L6+ System Design and Architecture interviews.

---

## SECTION 1: Architecture & Trade-Off Rationale

### Q1: "Why Event Sourcing over traditional CRUD with PostgreSQL or DynamoDB?"
- **Answer**: In workflow execution, **state is a history, not a single point-in-time snapshot**. Traditional CRUD overwrites intermediate states. If a job fails at Step 4 out of 10, a CRUD model cannot answer: *"What exact parameters were passed to Step 2, and what was its output?"*
- **Hermes Design**: Every state transition (`WorkflowExecutionStarted`, `StepCompleted`, `StepFailed`) is an append-only domain event stored in DynamoDB (`EVT#<seq>`). Current state is a derived projection that can be rebuilt at any sequence number or timestamp for time-travel debugging and audit compliance.

---

### Q2: "Why DynamoDB for the Event Store instead of Aurora PostgreSQL?"
- **Answer**: 
  1. **Connection Exhaustion under Lambda Concurrency**: Lambda activity workers burst to 10,000+ concurrent instances. PostgreSQL requires connection pools (or RDS Proxy) which cap out under serverless concurrency spikes. DynamoDB is HTTP/HTTPS stateless  no connection limit.
  2. **Predictable Latency at Any Volume**: Single-digit millisecond `TransactWriteItems` performance regardless of table size.
  3. **Native Streams Outbox**: DynamoDB Streams trigger `outbox-publisher` without requiring polling threads or Debezium CDC infrastructure.

---

### Q3: "How does Hermes solve the Dual-Write Problem during event appends?"
- **Answer**: Calling EventBridge inline *after* writing to DynamoDB is a dual-write vulnerability. If EventBridge fails or times out after the DynamoDB write succeeds, the event is silently lost from the bus.
- **Hermes Design (Transactional Outbox)**: Command handlers use `TransactWriteItems` to atomically append the `EVT#` item and update the aggregate `META` item in a single DynamoDB transaction. DynamoDB Streams capture the write and forward it to an SQS outbox queue. The `outbox-publisher` Lambda reads SQS and publishes to EventBridge. If EventBridge is down, SQS retries with exponential backoff and DLQ fallback. Zero lost events.

---

## SECTION 2: The 4 Platform Pillars Deep-Dive

### Q4: "How does the Replay Engine avoid re-executing non-deterministic activities?"
- **Answer**: When replaying an execution from `fromStep = "classify"`, steps prior to `classify` (e.g., `validate` and `ocr`) must NOT run again.
- **Hermes Design**: 
  1. `ReplayService` calls `ExecutionStateProjector.projectToSequence()` to compute a `ReplayDelta`.
  2. Completed step outputs prior to `fromStep` are extracted from past `STEP_COMPLETED` events and injected into the Step Functions execution context as `$.replayContext.cachedOutputs`.
  3. In Step Functions ASL v2 (`document-pipeline-v2.json`), a `Choice` state before each activity checks `$.replayContext.cachedOutputs.<stepName>`. If present, it skips Lambda invocation and passes the cached output directly to the next state.

---

### Q5: "How does Saga Compensation handle network failures during rollback?"
- **Answer**: When a step fails, `SagaManager` triggers compensation steps in Last-In, First-Out (LIFO) order. If a compensation activity (e.g. `DELETE_S3_ARTIFACT`) fails due to a network glitch:
- **Hermes Design**:
  1. Compensation actions are **idempotent by design**.
  2. `SagaExecution` tracks completed compensations in `completedCompensations`.
  3. If compensation retries, `SagaManager` checks `sagaExecution.isCompensationCompleted(step)`. Already-compensated steps are skipped, preventing duplicate side effects.

---

### Q6: "How do you handle Event Schema Evolution without breaking historic replays?"
- **Answer**: Historic events in DynamoDB are immutable. If `WorkflowExecutionStarted` v1 is missing a new `priority` field added in v2:
- **Hermes Design (Greg Young Upcaster Pattern)**: `EventSchemaUpcaster` registers pure payload transformation functions (`v1 -> v2`, `v2 -> v3`). At read time, when `loadEventStream` parses an event with `eventVersion = 1`, it runs the registered upcaster chain in memory before returning the event to the domain. The stored item in DynamoDB remains untouched.

---

## SECTION 3: Operations, DLQ & Reliability

### Q7: "What is a Poison Message in Hermes, and how is it handled?"
- **Answer**: A poison message is a message in the SQS DLQ whose `receiveCount >= 5` (failed maximum SQS delivery attempts).
- **Hermes Design**:
  1. `DlqInspectionService` provides a safe peek API (`visibilityTimeout = 0`) via `GET /api/v1/dlq`.
  2. Poison messages are explicitly flagged in `DlqController`.
  3. Automated redrives for poison messages are blocked  an operator must either redrive manually via `POST /api/v1/dlq/{id}/redrive` (after fixing upstream code) or purge the message via `DELETE /api/v1/dlq/{id}` with a mandatory audit reason.

---

### Q8: "How does the Replay Engine scale when an aggregate has 10,000+ events?"
- **Answer**: Reading 10,000 events from DynamoDB for every replay query consumes significant RCU and introduces latency.
- **Hermes Design**: `snapshot-trigger` Lambda writes an `AggregateSnapshot` item (`SK = SNAP#<seq>`) every 50 events. `DynamoDbEventStoreReader` queries `SNAP#` first in descending order. If found at sequence 9,500, it resumes event stream loading from sequence 9,501, achieving **10x to 50x fold latency reduction**.
