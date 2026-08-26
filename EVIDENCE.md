# Hermes v1.0.0 — Production-Inspired Engineering Evidence

This document provides a single index of all empirical engineering evidence, validation scripts, test suites, and operational guides across the Hermes platform.

---

## Evidence Checklist

| Evidence Category | Verification / Link | Status |
|---|---|---|
| **Automated CI/CD Validation** | [GitHub Actions Workflow](.github/workflows/ci.yml) | Passing |
| **Infrastructure-as-Code Validation** | `terraform validate` across `dev` & `staging` | Validated (20 configurations) |
| **Unit & Integration Test Suite** | 260 TS tests, 42 Java tests, 9 Python tests | 311 / 311 Passing |
| **Code Coverage** | V8 / JaCoCo / Pytest Coverage Reports | 100% Core Domain & Store |
| **Concurrency & Invariants** | Property & Chaos Tests (`shared/domain`, `shared/event-store`) | Validated |
| **Monorepo Verification Pipeline** | Single entry point ([`scripts/verify-all.sh`](scripts/verify-all.sh)) | Exit Code 0 |
| **Comprehensive Test Suite & Plan** | [Test Plan & Verification Matrix](screenshots/aws/tests/test-03/README.md) | Documented (26 test cases) |
| **Critical Path Smoke Test** | 8-layer critical path verification script ([`scripts/smoke-test.sh`](scripts/smoke-test.sh)) | Functional |
| **Live Dev Load Test Execution** | Benchmark Report ([`screenshots/aws/tests/test-03/LOAD_TEST.md`](screenshots/aws/tests/test-03/LOAD_TEST.md)) | Executed (Smoke/Baseline: Degraded; Stress: Safety Stop) |
| **Evidence Documentation** | Evidence Catalog & Provenance ([`screenshots/aws/tests/test-03/evidence/README.md`](screenshots/aws/tests/test-03/evidence/README.md)) | Documented (24 Curated Screenshots) |

---

## Curated Screenshot Artifacts Layout (`screenshots/aws/tests/test-03/evidence/`)

The repository curates 24 high-resolution production and runtime evidence screenshots:

| # | Artifact | File Path | Category | Content Description |
|---|---|---|---|---|
| 1 | **Monorepo Verification** | [`evidence/01-monorepo-verification-pass.png`](screenshots/aws/tests/test-03/evidence/01-monorepo-verification-pass.png) | Monorepo Pipeline | Unified verification passing all 5 verification tiers in one run. |
| 2 | **AWS Lambda** | [`evidence/02-aws-lambda-functions.png`](screenshots/aws/tests/test-03/evidence/02-aws-lambda-functions.png) | AWS Configuration | 12 deployed Hermes microservices and worker functions in `ap-south-1`. |
| 3 | **AWS Step Functions** | [`evidence/03-aws-step-functions.png`](screenshots/aws/tests/test-03/evidence/03-aws-step-functions.png) | AWS Configuration | Active `document-pipeline-v1` state machine orchestration. |
| 4 | **AWS EventBridge** | [`evidence/04-aws-eventbridge-bus.png`](screenshots/aws/tests/test-03/evidence/04-aws-eventbridge-bus.png) | AWS Configuration | EventBridge event bus with 90-day archive for event replay. |
| 5 | **EventBridge Rules** | [`evidence/05-aws-eventbridge-rules.png`](screenshots/aws/tests/test-03/evidence/05-aws-eventbridge-rules.png) | AWS Configuration | Content-filtered routing rules dispatching workflow events. |
| 6 | **DynamoDB Tables** | [`evidence/06-aws-dynamodb-tables.png`](screenshots/aws/tests/test-03/evidence/06-aws-dynamodb-tables.png) | AWS Configuration | All 6 single-table DynamoDB instances deployed in `ap-south-1`. |
| 7 | **Event Store Table** | [`evidence/07-aws-dynamodb-event-store.png`](screenshots/aws/tests/test-03/evidence/07-aws-dynamodb-event-store.png) | AWS Runtime | Event-sourced transaction items with sequential versioning & tenant keys. |
| 8 | **Read Model Table** | [`evidence/08-aws-dynamodb-execution-read-model.png`](screenshots/aws/tests/test-03/evidence/08-aws-dynamodb-execution-read-model.png) | AWS Runtime | Asynchronously projected execution state items in DynamoDB. |
| 9 | **AWS SQS Queues** | [`evidence/09-aws-sqs-queues.png`](screenshots/aws/tests/test-03/evidence/09-aws-sqs-queues.png) | AWS Configuration | Transactional outbox queue and Dead Letter Queue (`hermes-dev-outbox-dlq`). |
| 10 | **AWS SQS DLQ** | [`evidence/10-aws-sqs-dlq.png`](screenshots/aws/tests/test-03/evidence/10-aws-sqs-dlq.png) | AWS Runtime | Dead Letter Queue details demonstrating zero visible messages under health. |
| 11 | **CloudWatch Dashboard** | [`evidence/11-aws-cloudwatch-dashboard.png`](screenshots/aws/tests/test-03/evidence/11-aws-cloudwatch-dashboard.png) | AWS Observability | Live dashboard graphs for workflow duration, API latency, & health. |
| 12 | **CloudWatch Alarms** | [`evidence/12-aws-cloudwatch-alarms.png`](screenshots/aws/tests/test-03/evidence/12-aws-cloudwatch-alarms.png) | AWS Observability | Metric alarms monitoring DLQ depth ($>0$), Lambda errors, and SFN failures. |
| 13 | **Hermes CLI** | [`evidence/13-hermes-cli-help.png`](screenshots/aws/tests/test-03/evidence/13-hermes-cli-help.png) | Developer CLI | Interactive CLI menu, workflow compiler, and execution triggers. |
| 14 | **TypeScript Tests** | [`evidence/14-typescript-tests-pass.png`](screenshots/aws/tests/test-03/evidence/14-typescript-tests-pass.png) | Test Suite | 260 unit, integration, and contract tests across 57 suites passing. |
| 15 | **Property Tests** | [`evidence/15-typescript-property-tests.png`](screenshots/aws/tests/test-03/evidence/15-typescript-property-tests.png) | Test Suite | Property-based testing (`fast-check`) verifying domain invariants. |
| 16 | **Concurrency Tests** | [`evidence/16-event-store-concurrency-tests.png`](screenshots/aws/tests/test-03/evidence/16-event-store-concurrency-tests.png) | Test Suite | Optimistic concurrency: 100 concurrent workers race, 1 succeeds, 99 fail. |
| 17 | **Java Admin Tests** | [`evidence/17-java-admin-service-tests.png`](screenshots/aws/tests/test-03/evidence/17-java-admin-service-tests.png) | Test Suite | 19 JUnit 5 tests passing in `services/admin-service`. |
| 18 | **Java Replay Tests** | [`evidence/18-java-replay-service-tests.png`](screenshots/aws/tests/test-03/evidence/18-java-replay-service-tests.png) | Test Suite | 23 JUnit 5 tests passing in `services/replay-service`. |
| 19 | **Python AI Tests** | [`evidence/19-python-tests-pass.png`](screenshots/aws/tests/test-03/evidence/19-python-tests-pass.png) | Test Suite | 9 pytest worker test cases passing in `services/ai-workers`. |
| 20 | **Terraform Validation** | [`evidence/20-terraform-validation-pass.png`](screenshots/aws/tests/test-03/evidence/20-terraform-validation-pass.png) | Infrastructure | Automated validation across all 18 modules, `dev`, and `staging`. |
| 21 | **CloudWatch Metrics** | [`evidence/21-load-test-cloudwatch-lambda-metrics.png`](screenshots/aws/tests/test-03/evidence/21-load-test-cloudwatch-lambda-metrics.png) | Live Load Test | Invocations, duration, and 0.0 error monitoring during load test. |
| 22 | **CloudWatch Throttles** | [`evidence/22-load-test-cloudwatch-lambda-throttles.png`](screenshots/aws/tests/test-03/evidence/22-load-test-cloudwatch-lambda-throttles.png) | Live Load Test | Lambda concurrency throttle spikes observed during burst traffic. |
| 23 | **API Gateway Route** | [`evidence/23-load-test-api-gateway-route-integration.png`](screenshots/aws/tests/test-03/evidence/23-load-test-api-gateway-route-integration.png) | Live Load Test | `POST /assets` HTTP route attached to `hermes-dev-command-api`. |
| 24 | **CloudWatch Log Streams** | [`evidence/24-load-test-cloudwatch-log-streams.png`](screenshots/aws/tests/test-03/evidence/24-load-test-cloudwatch-log-streams.png) | Live Load Test | 18 active Lambda execution container log streams on 2026/08/26. |

---

## Architectural Verification Highlights

1. **Transactional Outbox Guarantee**:
   - Atomic writes to DynamoDB event store table with outbox items.
   - SQS stream consumer with batching and idempotency guards preventing dual-write loss.

2. **CQRS Read Model Projections**:
   - Asynchronous projection handlers consume EventBridge events and project into 6 single-table read models (Execution, Workflow, Asset, Tenant, Usage, Audit).

3. **Event Schema Versioning & Upcasting**:
   - Transparent schema evolution (v1 → v2) via zero-downtime upcaster pipeline ([`docs/SCHEMA_VERSIONING.md`](docs/SCHEMA_VERSIONING.md)).

4. **Security & Threat Defense**:
   - Cognito JWT authentication, mandatory `x-tenant-id` header extraction, role-based authorization (Admin, User, Service), and STRIDE threat analysis ([`THREAT_MODEL.md`](THREAT_MODEL.md)).

---

## Demonstration & Review Artifacts

- [**DEMO.md**](DEMO.md) — 10–15 minute live presentation script & walkthrough steps
- [**RUNBOOK.md**](RUNBOOK.md) — Operations, deployment playbooks, and disaster recovery
- [**INTERVIEW_GUIDE.md**](INTERVIEW_GUIDE.md) — Architectural defense & elevator introduction pitches
- [**SLO.md**](SLO.md) — Service Level Objectives, error budgets, and burn rate alerts
- [**COST_ESTIMATES.md**](COST_ESTIMATES.md) — Operational AWS monthly cost breakdown
- [**TESTING.md**](TESTING.md) — Multi-language testing guide and commands
- [**TEST_PLAN.md**](screenshots/aws/tests/test-03/TEST_PLAN.md) — 15-section test plan
- [**TEST_CASES.md**](screenshots/aws/tests/test-03/TEST_CASES.md) — 26-scenario test case matrix
- [**LOAD_TEST.md**](screenshots/aws/tests/test-03/LOAD_TEST.md) — Live dev load test report
