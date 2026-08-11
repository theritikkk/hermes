# Hermes — 10-15 Minute Live System Walkthrough Script

This script provides a structured guide for presenting a live demonstration of Hermes during technical interviews, portfolio presentations, or system design deep-dives.

---

## Walkthrough Timeline & Checklist

### 1. Project Overview (0:00 - 1:30)
- **Elevator Pitch**: "Hermes is a production-inspired serverless workflow orchestration platform built natively on AWS. It handles multi-step document pipelines, ETL tasks, and approval flows using Event Sourcing, CQRS, the Transactional Outbox pattern, and AWS Step Functions."
- **Key Problem Solved**: Eliminates dual-write data loss risks between databases and message brokers while providing $O(1)$ query speeds and complete audit trails.

### 2. Architecture & Design Patterns (1:30 - 3:30)
- Show [`ARCHITECTURE.md`](ARCHITECTURE.md) request flow diagram.
- Explain the **Transactional Outbox Pattern**:
  - `command-api` appends aggregate state and outbox events to DynamoDB in a single atomic transaction (`TransactWriteItems`).
  - SQS stream buffer triggers `outbox-publisher` to deliver events to EventBridge with guaranteed at-least-once semantics.
- Explain **CQRS**: Command side appends events; Query side reads exclusively from DynamoDB projections (`execution-read-model`) and OpenSearch.

### 3. Infrastructure & Terraform Deployment (3:30 - 5:00)
- Demonstrate `infra/environments/dev/main.tf` modular structure.
- Point out KMS Customer Key rotation (`enable_key_rotation = true`), S3 Glacier lifecycle rules, and AWS WAFv2 Web ACL (`RateLimitPerIP`).

### 4. Live Command Execution: `POST /assets` (5:00 - 6:30)
- Execute `POST /assets` command via `curl` or `./scripts/dev.sh`:
  ```bash
  curl -i -X POST "https://tuyyhzi8w7.execute-api.ap-south-1.amazonaws.com/assets" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: tenant-alpha" \
    -H "x-role: User" \
    -d '{"s3Key":"invoice-2026.pdf","workflowName":"document-pipeline-v1"}'
  ```
- Demonstrate **Tenant Isolation & RBAC**:
  - Show header `x-tenant-id: tenant-alpha` with body `tenantId: tenant-beta` triggering HTTP 403 `TenantIsolationError`.

### 5. EventBridge & Step Functions Orchestration (6:30 - 8:30)
- Show EventBridge bus `hermes-dev-events` routing `WorkflowExecutionStarted` to Step Functions state machine `document-pipeline-v1`.
- Walk through state machine execution graph in AWS Console / CLI:
  - `validate-worker` → `ocr-worker` → `classify-worker`.

### 6. CQRS Read Model & Query API (8:30 - 10:00)
- Execute `GET /executions/{executionId}` query:
  ```bash
  curl -s "https://tuyyhzi8w7.execute-api.ap-south-1.amazonaws.com/executions/<executionId>"
  ```
- Highlight $O(1)$ DynamoDB `GetItem` response latency (< 15ms).

### 7. Observability & X-Ray Distributed Tracing (10:00 - 12:00)
- Show structured CloudWatch log entries containing correlated `traceId`, `correlationId`, `executionId`, `tenantId`, and `userId`.
- Show CloudWatch Observability Dashboard (`hermes-dev-observability-dashboard`) widgets.
- Show AWS X-Ray end-to-end trace map spanning API Gateway → Lambda → DynamoDB → EventBridge → Step Functions.

### 8. Automated Testing & Verification (12:00 - 13:30)
- Run zero-dependency unit test suite:
  ```bash
  npm test
  ```
  *(21 unit tests pass in ~1.1 seconds).*
- Run live 8-layer critical path smoke test:
  ```bash
  AWS_REGION=ap-south-1 ./scripts/smoke-test.sh
  ```

### 9. Conclusion & Q&A (13:30 - 15:00)
- Summarize operational metrics: 100% test coverage, 0 DLQ poison messages, 145ms p50 ingestion latency.
- Open floor for technical defense Q&A.
