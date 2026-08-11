# Hermes Platform  Architectural & Technical Reference

> **Principal Engineer Reference Guide**
> An event-sourced, CQRS-based workflow orchestration platform natively engineered on AWS (TypeScript + Node.js Lambdas, Java 25 + Spring Boot, Step Functions, EventBridge, DynamoDB, Aurora PostgreSQL, OpenSearch, Cognito, S3).

---

## 1. System Architecture Overview

Hermes decouples state mutation from state observation through strict **Event Sourcing** and **CQRS (Command Query Responsibility Segregation)** boundaries.

```
                  
                                   Command Side (Write Path)               
                  
                                               
                                               
 Client   API Gateway  command-api (TypeScript / Lambda)
                                               
                                               
                                      DynamoDB Event Store
                              (PK: TENANT#t#EXEC#id, SK: EVT#seq)
                                               
                                     DynamoDB Streams
                                               
                                               
                                       Outbox SQS Queue
                                               
                                               
                                    outbox-publisher Lambda
                                               
                                               
                                          EventBridge
                                         /           \
                                        /             \
                  /               \
                   Orchestration Side                   Query Side       
                                 
                                                                         
                             Step Functions Engine           execution-projection Lambda
                             (Per-version ASL)                            
                                                                         
                               Activity Workers                  DynamoDB Read Model
                            (Node.js / Lambda Token)             (Current Execution State)
                                                                         
                                                                         
                              POST /api/v1/step-results               query-api (TypeScript / Lambda)
                                   (command-api)                          
                                                                          
                                                                     Dashboard / UI
```

---

## 2. DynamoDB Single-Table Design Schema

The event store table (`hermes-dev-event-store`) uses a single-table layout supporting event append, snapshot retrieval, idempotency guards, and time-travel replay queries.

| Item Type | Partition Key (`PK`) | Sort Key (`SK`) | Attributes & Details |
|---|---|---|---|
| **Aggregate Metadata** | `EXEC#<executionId>` | `META` | `workflowName`, `workflowVersion`, `tenantId`, `status`, `version` (optimistic locking) |
| **Domain Event** | `EXEC#<executionId>` | `EVT#<10-digit seq>` | `eventId`, `eventType`, `eventVersion`, `correlationId`, `occurredAt`, `payload` (JSON) |
| **Aggregate Snapshot** | `EXEC#<executionId>` | `SNAP#<10-digit seq>` | `atSequence`, `stateJson`, `createdAt`, `tenantId` |
| **Idempotency Key** | `TENANT#<tenantId>` | `IDEM#<key>` | `executionId`, `createdAt`, `ttl` (24-hour expiration) |

### Secondary Index (`GSI1`)
- `GSI1PK`: `TENANT#<tenantId>#WORKFLOW#<workflowName>`
- `GSI1SK`: `EXEC#<executionId>`
- **Use Case**: Allows instantaneous listing of all workflow executions for a specific tenant and workflow definition.

---

## 3. The 4 Core Platform Pillars

### Pillar 1: Time-Travel Replay Engine (`services/replay-service`)
- **State Machine**: [`ExecutionStateProjector.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/replay-service/src/main/java/com/hermes/replay/application/ExecutionStateProjector.java) pure domain fold engine.
- **Snapshot Acceleration**: Reads the latest snapshot (`SNAP#`) via [`SnapshotStore.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/replay-service/src/main/java/com/hermes/replay/infrastructure/eventstore/SnapshotStore.java) and resumes event stream loading from `snapshot.resumeFromSequence()`.
- **Execution Delta**: Differentiates completed steps with valid outputs from modified steps requiring re-dispatch. Injects cached outputs into Step Functions `replayContext`.

### Pillar 2: Saga Orchestration & Compensation
- **Coordinator**: Saga compensation logic is embedded in the command handling pipeline via `@hermes/command-handlers` (TypeScript) and orchestrated through Step Functions ASL catch/retry states.
- **LIFO Execution**: Tracks completed forward steps and executes inverse compensation steps in reverse order (Last-In, First-Out).
- **Idempotency**: Maintains an in-aggregate set of completed compensation steps to safeguard against duplicate rollback attempts under activity retries.

### Pillar 3: Fluent Workflow SDK (`shared/sdk/typescript`)
- **TypeScript DSL**: [`WorkflowBuilder`](file:///Users/ritikraj/Documents/GitHub/hermes/shared/sdk/typescript/src/workflow.ts) programmatically constructs type-safe workflow definitions with retry policies, catch blocks, parallel branches, and saga configurations.
- **ASL Compiler**: [`AslCompiler`](file:///Users/ritikraj/Documents/GitHub/hermes/shared/sdk/typescript/src/workflow.ts) transforms the builder model into Amazon States Language (ASL) JSON ready for direct submission to the Step Functions `CreateStateMachine` API.
- **TypeScript Client**: [`client.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/shared/sdk/typescript/src/client.ts) zero-dependency, `fetch`-based `HermesClient` for starting executions, polling status, and calling replay endpoints.

### Pillar 4: Workflow & Event Versioning (`services/admin-service`)
- **Version Registry**: [`WorkflowVersionRegistry.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/admin-service/src/main/java/com/hermes/admin/domain/WorkflowVersionRegistry.java) enforces a strict `DRAFT -> ACTIVE -> DEPRECATED` lifecycle.
- **Version Pinning**: Executions are immutably bound to the `workflowVersion` active at trigger time.
- **Schema Upcaster**: Event schema upcasting is handled at read time in the `@hermes/event-store` TypeScript package and via JSON Schema definitions in `shared/event-schemas/`. A chain of pure payload transformations converts older event payloads (v1 -> v2 -> v3) transparently.

---

## 4. AWS Native Service Rationale

| Service | Role in Hermes | Rationale over Multi-Cloud / Generic Abstractions |
|---|---|---|
| **TypeScript + Node.js** | Command API, Query API, Lambda Workers, Activity Workers, Event Projections | Stateless, I/O-bound Lambda handlers with sub-100ms cold start. npm workspace shares `@hermes/*` domain packages. |
| **Java 25 + Spring Boot** | Replay Service, Admin Service | Spring Security for Cognito JWT validation, Spring Data JPA + Flyway for PostgreSQL schema management, Micrometer CloudWatch export. Runs on ECS Fargate. |
| **AWS Step Functions** | Process Manager | Serverless, visual, durable workflow execution engine. Manages state machine transitions without custom poller infrastructure. |
| **AWS EventBridge** | Event Bus | Native integration backbone. Direct EventBridge-to-Step-Functions targets eliminate Lambda glue code. |
| **Amazon DynamoDB** | Event Store & Read Model | Infinite auto-scaling write throughput under bursting activity completions with zero connection pool limits. |
| **Amazon SQS + DLQ** | Outbox Buffer & Dead-Letter Queue | Guarantees at-least-once outbox publishing with configurable visibility timeouts and redrive policies. |
| **Amazon OpenSearch** | Derived Search Index | Sub-second full-text document search and analytics over workflow execution outputs. |
| **AWS Secrets Manager & SSM** | Security & Configuration | Centralized secret rotation and parameters for service configurations and database credentials. |

---

## 5. DLQ & Operational Management Commands

### Inspect DLQ Messages
```bash
curl -X GET -H "Authorization: Bearer $TOKEN" https://admin.hermes.internal/api/v1/dlq?maxMessages=20
```

### Redrive Message
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "X-Operator-ID: op-1" \
  -d '{"receiptHandle":"$HANDLE","body":"$BODY"}' \
  https://admin.hermes.internal/api/v1/dlq/$MSG_ID/redrive
```

### Trigger Time-Travel Replay
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: tenant-dev" \
  -d '{"executionId":"exec-101","fromStep":"ocr","skipCompletedSteps":true,"reason":"Replay from ocr"}' \
  https://replay.hermes.internal/replay
```
