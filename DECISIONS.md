# Hermes — Architecture Decision Records (ADRs)

This document records the key architectural decisions, trade-offs, and context behind the design of Hermes.

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

### Context
In distributed event-sourced architectures, updating an aggregate in a database and publishing an event to a message broker (EventBridge) must happen atomically. Dual writes (writing to DB then calling `EventBridge.putEvents`) risk partial failure: if EventBridge fails, the event is lost; if DB fails after publishing, phantom events exist.

### Decision
Implement the **Transactional Outbox Pattern**:
1. When handling a command, write the aggregate change and the domain event into the same DynamoDB table transaction (`hermes-dev-event-store`).
2. Set event outbox status to `PENDING`.
3. An SQS stream listener (`outbox-publisher`) asynchronously batches events, publishes them to EventBridge, and updates outbox status to `PUBLISHED`.
4. A cron-triggered `outbox-republisher` scans for events stranded in `PENDING` status for > 5 minutes and republishes them.

### Consequences
- **Pros**: Guaranteed at-least-once event delivery, zero lost events, atomic database operations.
- **Cons**: Sub-second event publishing latency delay (typically ~50ms via SQS), consumers must handle duplicate events (idempotent projections).

---

## ADR-002: CQRS Read Models in DynamoDB + OpenSearch

### Context
The Event Store is optimized for append-only writes and snapshot replay by `aggregateId`. Querying execution metrics, tenant analytics, or full-text search directly against the event store is inefficient and costly.

### Decision
Separate Command and Query Responsibilities (CQRS):
1. **Command Side**: DynamoDB Single-Table Event Store (`AGG#<type>#<id>`, `EVT#<seq>#<id>`).
2. **Query Side**: Dedicated read-model DynamoDB tables (`execution-read-model`, `workflow-read-model`, `asset-read-model`, `tenant-read-model`, `metrics-read-model`, `audit-read-model`) and an OpenSearch domain for full-text search and analytical aggregations.
3. Event projections (`execution-projection`, `usage-projection`, `opensearch-projection`) consume EventBridge events asynchronously to maintain read models.

### Consequences
- **Pros**: Fast $O(1)$ query lookups, independent write/read scaling, zero query load on event store.
- **Cons**: Eventual consistency between event publication and read model update (typically < 200ms).

---

## ADR-003: Step Functions Orchestration over Pure Lambda Choreography

### Context
Document processing workflows involve multi-step pipelines (`validate` → `ocr` → `classify` → `projection`). Pure event-driven choreography (workers invoking next workers via EventBridge) makes state tracking, retries, and error visualization complex.

### Decision
Use **AWS Step Functions (JSON-based State Machines)** as the orchestrator:
1. Define declarative state machine definitions (`workflows/document-pipeline-v1.json`).
2. Step Functions manages step states, retries, exponential backoff, and execution history.
3. Workers run as stateless AWS Lambda activity tasks.

### Consequences
- **Pros**: Clear visual workflow graph in AWS Console, built-in retry logic, explicit execution status tracking.
- **Cons**: Step Functions state transition charges (offset by AWS free tier and efficiency gains).

---

## ADR-004: Multitenancy Isolation & Cognito JWT Authorization

### Context
Hermes serves multiple enterprise tenants on a shared platform. Strict tenant data boundary enforcement is mandatory to prevent unauthorized access across tenants.

### Decision
1. Standardize authentication using **Amazon Cognito User Pools** with custom claims (`custom:tenantId`) and Cognito Groups (`Admin`, `User`, `Service`).
2. API Gateway HTTP API validates JWT signatures automatically via `aws_apigatewayv2_authorizer`.
3. Application handlers (`command-api` & `query-api`) extract caller context using `@hermes/domain` helpers (`extractAuthContext`, `enforceTenantIsolation`, `enforceRBAC`). Non-admin cross-tenant requests throw `TenantIsolationError` returning HTTP 403 Forbidden.

### Consequences
- **Pros**: Defense-in-depth security at both API Gateway and application handler layers, zero risk of tenant data leak.
- **Cons**: JWT token management required for testing (handled via dev header fallback mode in local test scripts).

---

## ADR-005: Zero-Dependency Node.js Native Test Runner

### Context
Monorepos with heavy testing frameworks (Jest, Mocha) suffer from slow startup times, complex transpile setups, and large `node_modules` overhead.

### Decision
Use Node.js v20+ built-in native test runner (`node --test`) combined with `tsx` TypeScript loader:
```json
"scripts": {
  "test": "node --import tsx --test src/**/*.test.ts"
}
```

### Consequences
- **Pros**: Zero external test framework dependencies, execution speed (< 1.2 seconds for full suite), native TypeScript ESM support.
- **Cons**: Requires Node.js >= 20.
