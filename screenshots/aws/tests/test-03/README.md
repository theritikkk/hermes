# Hermes
### Event-Sourced Workflow Orchestration Platform

Hermes is an event-sourced workflow orchestration platform built on AWS serverless primitives. This document provides an empirical verification package designed for technical reviewers and hiring managers to evaluate the platform's distributed systems implementation, code quality, and cloud architecture in 3–5 minutes.

Implemented event-sourced workflow execution with DynamoDB persistence, EventBridge routing, SQS-based outbox processing, and Step Functions orchestration.

---

## Verification Summary

| Layer | Result | Evidence |
|---|---|---|
| **TypeScript** | **260 / 260 PASS** (57 suites, 0 failures) | [`evidence/14-typescript-tests-pass.png`](evidence/14-typescript-tests-pass.png) |
| **Java** | **42 / 42 PASS** (19 admin-service + 23 replay-service) | [`evidence/17-java-admin-service-tests.png`](evidence/17-java-admin-service-tests.png), [`evidence/18-java-replay-service-tests.png`](evidence/18-java-replay-service-tests.png) |
| **Python** | **9 / 9 PASS** (pytest 8.4 in `services/ai-workers`) | [`evidence/19-python-tests-pass.png`](evidence/19-python-tests-pass.png) |
| **Terraform** | **20 / 20 Validated** (18 modules + `dev` + `staging`) | [`evidence/20-terraform-validation-pass.png`](evidence/20-terraform-validation-pass.png) |
| **CLI** | **Functional** (Interactive CLI & ASL compiler) | [`evidence/13-hermes-cli-help.png`](evidence/13-hermes-cli-help.png) |
| **AWS Runtime** | **Verified in `ap-south-1`** (Lambda, SFN, EB, DynamoDB, SQS, CW) | Section 2 screenshots below |
| **Load Testing** | **Live Dev Executed** (Smoke & Baseline: Degraded; Stress: Safety Stop) | [`LOAD_TEST.md`](LOAD_TEST.md) |

---

## What This Evidence Demonstrates

1. **Event Sourcing & Immutability**: State is captured as an append-only sequence of immutable events (`AssetRegistered`, `WorkflowExecutionStarted`, `StepCompleted`) in DynamoDB with strictly incrementing sequence numbers.
2. **CQRS Read-Model Projections**: Command handlers append events atomically; asynchronous Lambda projection workers consume EventBridge streams to update single-table query models (`execution-read-model`, `audit-read-model`, `tenant-read-model`).
3. **Optimistic Concurrency Control (OCC)**: Atomic conditional writes (`TransactWriteItems`) guarantee that when 100 concurrent workers race for sequence 1, exactly 1 succeeds and 99 fail with `ConcurrencyException`.
4. **Distributed Workflow Orchestration**: AWS Step Functions state machines orchestrate polyglot activity workers (`validate-worker`, `ocr-worker`, `classify-worker`) with ASL-defined retry policies and Catch blocks.
5. **Transactional Outbox & Dual-Write Prevention**: Writes persist domain events and outbox items in a single transaction; an SQS outbox processor reliably dispatches events to EventBridge without distributed 2PC overhead.
6. **Dead Letter Queue (DLQ) & Resilience**: Unprocessable messages dead-letter to `hermes-dev-outbox-dlq` after 3 retries; CloudWatch alarms monitor queue depth and automated republishers scan for stale records.
7. **Time-Travel State Reconstruction**: Java Spring Boot `replay-service` reconstructs aggregate state at any historical point in time, combining aggregate snapshots with incremental delta replays.
8. **End-to-End Observability**: Structured JSON logging across all microservices, correlated via `traceId`/`executionId`, feeding into a unified CloudWatch dashboard and metric alarms.
9. **Polyglot Microservices Architecture**: TypeScript for core orchestration/workers, Java 25 (Spring Boot) for admin/replay management, and Python 3.13 for AI text extraction and embeddings.
10. **Infrastructure as Code (IaC)**: 18 modular Terraform modules defining least-privilege IAM roles, KMS encryption, DynamoDB PITR, and EventBridge archives.
11. **Automated Testing**: 350 total automated checks across unit, property-based (`fast-check`), chaos concurrency, contract, and infrastructure validation suites.

---

## 1. Unified Monorepo Verification

### Monorepo Verification Pipeline (`verify-all.sh`)
Executes all 5 verification tiers in a single pass: TypeScript unit/property tests, Java Maven JUnit 5 suites, Python pytest workers, Terraform module validation, and complete TypeScript compilation.

![Monorepo Verification](evidence/01-monorepo-verification-pass.png)

---

## 2. AWS Serverless Runtime Evidence

The following empirical screenshots demonstrate live AWS resources deployed in region `ap-south-1` (`hermes-dev-*`).

### Step Functions Workflow Orchestration
Shows the active `document-pipeline-v1` state machine orchestration definition and execution engine.

![Step Functions](evidence/03-aws-step-functions.png)

### Amazon EventBridge Event Bus & 90-Day Archive
Shows the custom `hermes-dev-events` event bus configured with an event archive for replay.

![EventBridge Bus](evidence/04-aws-eventbridge-bus.png)

### EventBridge Content-Filtered Routing Rules
Shows routing rules dispatching workflow integration events (`WorkflowExecutionStarted`, `StepCompleted`) to target Step Functions and SQS queues.

![EventBridge Rules](evidence/05-aws-eventbridge-rules.png)

### AWS Lambda Microservices & Activity Workers
Shows 12 deployed Lambda functions running Node.js, Java, and Python microservices in `ap-south-1`.

![AWS Lambda](evidence/02-aws-lambda-functions.png)

### DynamoDB Single-Table Event Store
Shows the append-only event store (`hermes-dev-event-store`) with sequential sequence numbers, aggregate partition keys, and immutable payloads.

![DynamoDB Event Store](evidence/07-aws-dynamodb-event-store.png)

### DynamoDB CQRS Read Model Projections
Shows the execution read model (`hermes-dev-execution-read-model`) populated asynchronously via projection workers.

![DynamoDB Read Model](evidence/08-aws-dynamodb-execution-read-model.png)

### DynamoDB Single-Table Deployments Overview
Shows all 6 single-table DynamoDB instances deployed in `ap-south-1`.

![DynamoDB Tables](evidence/06-aws-dynamodb-tables.png)

### Amazon SQS Transactional Outbox & Dead Letter Queue
Shows the transactional outbox queue (`hermes-dev-outbox`) and Dead Letter Queue (`hermes-dev-outbox-dlq`).

![Amazon SQS](evidence/09-aws-sqs-queues.png)

### Amazon SQS DLQ Configuration Details
Shows dead-letter queue attributes with maximum receive count set to 3 and 14-day retention.

![Amazon SQS DLQ](evidence/10-aws-sqs-dlq.png)

### CloudWatch Observability Dashboard
Shows live graphs monitoring workflow duration, API Gateway request counts, and Lambda latency.

![CloudWatch Dashboard](evidence/11-aws-cloudwatch-dashboard.png)

### CloudWatch Metric Alarms
Shows configured alarms for DLQ message depth ($>0$), Lambda runtime errors, and Step Function failures.

![CloudWatch Alarms](evidence/12-aws-cloudwatch-alarms.png)

---

## 3. Hermes Developer CLI

### Interactive CLI Menu & Workflow Compiler
Shows the Hermes TypeScript CLI (`@hermes/cli`) providing workflow compilation, execution triggering, and event queries.

![Hermes CLI](evidence/13-hermes-cli-help.png)

---

## 4. Automated Multi-Language Test Suites

### Full TypeScript Test Suite (260 Tests / 57 Suites)
Runs across all monorepo workspaces via Node.js native test runner (`node:test` + `tsx`), verifying domain models, command handlers, and workers with 0 failures.

![TypeScript Tests](evidence/14-typescript-tests-pass.png)

### Property-Based Invariant Testing (`fast-check`)
Verifies domain aggregate invariants and schema types across 100+ randomized event streams in `shared/domain`.

![Property Tests](evidence/15-typescript-property-tests.png)

### DynamoDB Event Store Concurrency & Optimistic Locking
Empirically proves concurrency safety: 100 concurrent workers race for sequence 1 append; exactly 1 succeeds and 99 fail with `ConcurrencyException`.

![Event Store Concurrency](evidence/16-event-store-concurrency-tests.png)

### Java Spring Boot Admin Service (19 Tests)
Maven JUnit 5 test suite verifying workflow version registry, tenant provisioning, and quota enforcement with JaCoCo reports.

![Java Admin Service](evidence/17-java-admin-service-tests.png)

### Java Spring Boot Replay Service (23 Tests)
Maven JUnit 5 test suite verifying historical event stream replay, snapshot-aware loading, and point-in-time state reconstruction.

![Java Replay Service](evidence/18-java-replay-service-tests.png)

### Python AI Workers Pytest Suite (9 Tests)
Pytest suite verifying embedding generation, NER token extraction, and AI Gateway request dispatching in $0.02\text{s}$.

![Python AI Workers](evidence/19-python-tests-pass.png)

### Terraform Infrastructure Validation (20 Configurations)
Automated Terraform validation (`terraform validate`) across all 18 infrastructure modules, `dev`, and `staging` environments.

![Terraform Validation](evidence/20-terraform-validation-pass.png)

---

## 5. Live Non-Production Load Testing

Smoke and baseline profiles were executed against the Hermes development environment (`POST /assets` synchronous ingestion endpoint) using `scripts/load-test.ts`.

- **Smoke Profile ($c=2, n=20$)**: 18/20 (90%) HTTP 202 Accepted, p50 $153.55\text{ms}$ (`EXECUTED — DEGRADED`)
- **Baseline Profile ($c=10, n=200$)**: 68/200 (34%) HTTP 202 Accepted, 132/200 HTTP 503 (dev Lambda concurrency throttled), p50 $38.97\text{ms}$ on non-throttled writes (`EXECUTED — DEGRADED`)
- **Stress Profile ($c=25, n=1000$)**: Halted prior to execution per safety limits after baseline compute degradation (`NOT EXECUTED — SAFETY STOP`)

*Measured results reflect non-production development tier behavior in `ap-south-1` and do not represent certified production capacity.*

### CloudWatch Observability During Load Testing

#### Lambda Invocations, Duration & Error Monitoring (13:40–14:00 UTC)
Shows aggregate Lambda runtime metrics during the non-production load test run.

![CloudWatch Metrics](evidence/21-load-test-cloudwatch-lambda-metrics.png)

#### Lambda Concurrency Throttling Graph
Shows compute concurrency throttles observed on `hermes-dev-command-api` during burst execution.

![CloudWatch Throttles](evidence/22-load-test-cloudwatch-lambda-throttles.png)

#### API Gateway Command Route Integration
Shows `POST /assets` HTTP API Gateway route mapped directly to `hermes-dev-command-api`.

![API Gateway Integration](evidence/23-load-test-api-gateway-route-integration.png)

#### CloudWatch Container Execution Log Streams
Shows 18 distinct Lambda container log streams generated on `2026/08/26`.

![CloudWatch Log Streams](evidence/24-load-test-cloudwatch-log-streams.png)

- [**LOAD_TEST.md**](LOAD_TEST.md) — Complete execution benchmark report, status code breakdown, and reconciliation
- [**LOAD_TEST_PLAN.md**](LOAD_TEST_PLAN.md) — Performance strategy, SLA targets, and safety controls
- [**TEST_PLAN.md**](TEST_PLAN.md) — Comprehensive 15-section test plan
- [**TEST_CASES.md**](TEST_CASES.md) — Complete 26-scenario test case matrix

---

## 6. How to Reproduce All Tests Locally

```bash
# 1. Run full monorepo verification (all 5 tiers)
./scripts/verify-all.sh

# 2. Run TypeScript unit and property tests directly
npm run build
node --import tsx --test $(find shared services -name "*.test.ts" | grep -v "node_modules" | grep -v ".build")

# 3. Run Java Spring Boot services
cd services/admin-service && mvn test && cd ../..
cd services/replay-service && mvn test && cd ../..

# 4. Run Python AI worker tests
cd services/ai-workers && PYTHONPATH=. pytest -v && cd ../..

# 5. Validate Terraform infrastructure
./scripts/terraform-validate.sh

# 6. Test CLI help
node shared/sdk/typescript/dist/cli.js --help

# 7. Run load test harness in dry-run mode
npm run test:load -- --dry-run
```
