# Hermes — Architecture Decision Records (ADRs)

This document records the key architectural decisions, trade-offs, context, alternatives considered, and rejected options behind the design of Hermes.

---

## Index of Architecture Decision Records

| ADR ID | Title | Status | Date |
|---|---|---|---|
| **ADR-001** | Transactional Outbox Pattern for Event Publishing | Accepted | 2026-08-06 |
| **ADR-002** | CQRS Read Models in DynamoDB + OpenSearch | Accepted | 2026-08-07 |
| **ADR-003** | Step Functions Orchestration over Pure Lambda Choreography | Accepted | 2026-08-08 |
| **ADR-004** | Multitenancy Isolation & Cognito JWT Authorization | Accepted | 2026-08-09 |
| **ADR-005** | Zero-Dependency Node.js Native Test Runner | Accepted | 2026-08-11 |

---

## ADR-001: Transactional Outbox Pattern for Event Publishing

### Context & Problem Statement
In distributed event-sourced architectures, updating aggregate state in a database and publishing an event to a message broker (EventBridge) must happen atomically. Dual writes (writing to DB then calling `EventBridge.putEvents`) risk partial failure: if EventBridge fails, the event is lost; if DB fails after publishing, phantom events exist.

### Decision
Implement the **Transactional Outbox Pattern**:
1. When handling a command, write the aggregate change and the domain event into the same DynamoDB table transaction (`hermes-dev-event-store`).
2. Set event outbox status to `PENDING`.
3. An SQS stream listener (`outbox-publisher`) asynchronously batches events, publishes them to EventBridge, and updates outbox status to `PUBLISHED`.
4. A cron-triggered `outbox-republisher` scans for events stranded in `PENDING` status for > 5 minutes and republishes them.

### Alternatives Considered
1. **Inline EventBridge Publishing**: Invoke `EventBridge.putEvents()` inside the command API Lambda immediately after writing to DynamoDB.
2. **DynamoDB Streams Direct Lambda Trigger**: Trigger a Lambda directly from DynamoDB Streams without an intermediary SQS queue.

### Rejected Options & Rationale
- **Inline Publishing**: Rejected due to dual-write vulnerability. If EventBridge is transiently unavailable or throttled, DB writes succeed but downstream events are lost forever.
- **Direct DynamoDB Streams to Lambda**: Rejected because DynamoDB Streams alone do not provide configurable Dead Letter Queues (DLQ) or retry visibility timeouts without blocking stream processing shard order.

### Consequences
- **Positive**: Guaranteed at-least-once event delivery, zero lost events, atomic database operations.
- **Negative**: Sub-second event publishing latency delay (typically ~40–50ms via SQS), consumers must implement idempotent projection logic.

---

## ADR-002: CQRS Read Models in DynamoDB + OpenSearch

### Context & Problem Statement
The Event Store is optimized for append-only writes and snapshot replay by `aggregateId`. Querying execution metrics, tenant analytics, or full-text search directly against the event store requires full-table scans, which are cost-prohibitive and slow.

### Decision
Separate Command and Query Responsibilities (CQRS):
1. **Command Side**: DynamoDB Single-Table Event Store (`AGG#<type>#<id>`, `EVT#<seq>#<id>`).
2. **Query Side**: 6 dedicated read-model DynamoDB tables (`execution`, `workflow`, `asset`, `tenant`, `metrics`, `audit`) and an OpenSearch domain for full-text search and analytical aggregations.
3. Event projections (`execution-projection`, `usage-projection`, `opensearch-projection`) consume EventBridge events asynchronously to maintain read models.

### Alternatives Considered
1. **Single-Table Design for Command and Query**: Store read model items in the same table as the event store using Global Secondary Indexes (GSIs).
2. **Relational Database (RDS PostgreSQL) for Read Model**: Project events into SQL tables.

### Rejected Options & Rationale
- **Single-Table Command + Query**: Rejected because GSI write throughput capacity (WCU) updates would contend with high-throughput event store appends.
- **RDS PostgreSQL Read Model**: Rejected because managing connection pools for Lambda projections under high concurrency causes database connection exhaustion (`MaxConnectionsExceeded`).

### Consequences
- **Positive**: Fast $O(1)$ query lookups (< 15ms), independent write/read scaling, zero query load on event store.
- **Negative**: Eventual consistency between event publication and read model update (typically < 200ms).

---

## ADR-003: Step Functions Orchestration over Pure Lambda Choreography

### Context & Problem Statement
Document processing workflows involve multi-step pipelines (`validate` → `ocr` → `classify` → `projection`). Pure event-driven choreography (workers invoking next workers via EventBridge) makes state tracking, retries, and error visualization complex.

### Decision
Use **AWS Step Functions (JSON-based State Machines)** as the orchestrator:
1. Define declarative state machine definitions (`workflows/document-pipeline-v1.json`).
2. Step Functions manages step states, retries, exponential backoff, and execution history.
3. Workers run as stateless AWS Lambda activity tasks.

### Alternatives Considered
1. **Choreographed Worker Lambdas**: Workers publish `StepXCompleted` to EventBridge; rule triggers `StepYWorker`.
2. **External Orchestrator (Temporal / Airflow)**: Self-host a workflow engine on EC2 or EKS.

### Rejected Options & Rationale
- **Pure Choreography**: Rejected because state tracking becomes distributed and invisible. Handling retries across multiple workers requires complex custom code.
- **Temporal / Airflow**: Rejected due to infrastructure management overhead (running persistent server clusters and databases for serverless Lambda workloads).

### Consequences
- **Positive**: Clear visual workflow graph in AWS Console, built-in retry logic, explicit execution status tracking.
- **Negative**: Step Functions state transition charges ($0.025 per 1,000 state transitions), JSONPath payload transformation syntax complexity.

---

## ADR-004: Multitenancy Isolation & Cognito JWT Authorization

### Context & Problem Statement
Hermes serves multiple enterprise tenants on a shared platform. Strict tenant data boundary enforcement is mandatory to prevent unauthorized access across tenants.

### Decision
1. Standardize authentication using **Amazon Cognito User Pools** with custom claims (`custom:tenantId`) and Cognito Groups (`Admin`, `User`, `Service`).
2. API Gateway HTTP API validates JWT signatures automatically via `aws_apigatewayv2_authorizer`.
3. Application handlers (`command-api` & `query-api`) extract caller context using `@hermes/domain` helpers (`extractAuthContext`, `enforceTenantIsolation`, `enforceRBAC`). Non-admin cross-tenant requests throw `TenantIsolationError` returning HTTP 403 Forbidden.

### Alternatives Considered
1. **Request Body Tenant ID Parameter**: Trust caller-supplied `tenantId` in JSON payload.
2. **Database-per-Tenant Provisioning**: Provision separate DynamoDB tables and Lambdas for each tenant.

### Rejected Options & Rationale
- **Request Body Parameter**: Rejected because any client could forge `tenantId` in the body to access or write another tenant's data.
- **Database-per-Tenant**: Rejected due to high operational cost and Terraform resource limit constraints.

### Consequences
- **Positive**: Defense-in-depth security at both API Gateway and application handler layers, zero risk of tenant data leak.
- **Negative**: JWT token management required for testing (handled via dev header fallback mode in local test scripts).

---

## ADR-005: Zero-Dependency Node.js Native Test Runner

### Context & Problem Statement
Monorepos with heavy testing frameworks (Jest, Mocha) suffer from slow startup times, complex transpile setups, and large `node_modules` overhead.

### Decision
Use Node.js v20+ built-in native test runner (`node --test`) combined with `tsx` TypeScript loader:
```json
"scripts": {
  "test": "node --import tsx --test src/**/*.test.ts"
}
```

### Alternatives Considered
1. **Jest**: Standard JavaScript test runner.
2. **Vitest**: Vite-powered test runner.

### Rejected Options & Rationale
- **Jest**: Rejected due to slow initial startup times (~3–5s per package), Babel dependency overhead, and ESM transformation friction.
- **Vitest**: Rejected to maintain zero third-party framework dependencies in core test scripts.

### Consequences
- **Positive**: Zero external test framework dependencies, lightning-fast execution speed (< 1.2s for full suite), native TypeScript ESM support.
- **Negative**: Requires Node.js >= 20.0.
