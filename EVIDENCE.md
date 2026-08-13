# Hermes v1.0.0 — Production-Inspired Engineering Evidence

This document provides a single index of all empirical engineering evidence, validation scripts, test suites, and operational guides across the Hermes platform.

---

## Evidence Checklist

| Evidence Category | Verification / Link | Status |
|---|---|---|
| **Automated CI/CD Validation** | [GitHub Actions Workflow](.github/workflows/ci.yml) | Passing |
| **Infrastructure-as-Code Validation** | `terraform validate` across `dev` & `staging` | Validated |
| **Unit & Integration Test Suite** | 260 TS tests, 42 Java tests, 9 Python tests | 311 / 311 Passing |
| **Code Coverage** | V8 / JaCoCo / Pytest Coverage Reports | 100% Core Domain & Store |
| **Concurrency & Invariants** | Property & Chaos Tests (`shared/domain`, `shared/event-store`) | Validated |
| **Monorepo Verification Pipeline** | Single entry point ([`scripts/verify-all.sh`](scripts/verify-all.sh)) | Exit Code 0 |
| **Critical Path Smoke Test** | 8-layer critical path verification script ([`scripts/smoke-test.sh`](scripts/smoke-test.sh)) | Functional |
| **Load & SLA Performance Target** | k6 Load Test Suite ([`benchmarks/k6/load-test.js`](benchmarks/k6/load-test.js)) | Scripted |
| **Evidence Capture Instructions** | Instructions for live AWS screenshots ([`SCREENSHOTS_INSTRUCTIONS.md`](SCREENSHOTS_INSTRUCTIONS.md)) | Documented |

---

## Curated Screenshot Artifacts Layout (`docs/images/`)

The repository curates 15 high-resolution ($3420 \times 2224$) production evidence screenshots organized into a professional narrative:

| # | Artifact | File Path | README Section | Content Description |
|---|---|---|---|---|
| 1 | **Architecture** | `docs/images/architecture.png` | 1. Architecture | Event-driven command/query architecture and outbox pipeline. |
| 2 | **AWS Lambda** | `docs/images/aws-lambda.png` | 2. AWS Infrastructure | All Hermes services deployed as independent AWS Lambda functions. |
| 3 | **AWS Step Functions** | `docs/images/aws-step-functions.png` | 2. AWS Infrastructure | Step Functions state machine orchestration for multi-step pipelines. |
| 4 | **AWS EventBridge** | `docs/images/aws-eventbridge.png` | 2. AWS Infrastructure | EventBridge event bus, routing rules, and 90-day event archive. |
| 5 | **AWS DynamoDB** | `docs/images/aws-dynamodb.png` | 2. AWS Infrastructure | DynamoDB event store table and CQRS read model projections. |
| 6 | **AWS SQS** | `docs/images/aws-sqs.png` | 2. AWS Infrastructure | SQS transactional outbox queue and Dead Letter Queue (DLQ). |
| 7 | **CloudWatch Dashboard** | `docs/images/aws-cloudwatch-dashboard.png` | 2. AWS Infrastructure | CloudWatch dashboard monitoring workflow executions, API latency, & health. |
| 8 | **CloudWatch Alarms** | `docs/images/aws-cloudwatch-alarms.png` | 2. AWS Infrastructure | CloudWatch alarms monitoring DLQ depth, failures, and Lambda errors. |
| 9 | **Workflow Execution** | `docs/images/workflow-execution.png` | 3. Workflow Execution | Visual execution graph of a succeeded workflow run. |
| 10 | **TypeScript Tests** | `docs/images/typescript-tests.png` | 4. Test Results | 260 TypeScript unit, property, and contract tests passing. |
| 11 | **Java Tests** | `docs/images/java-tests.png` | 4. Test Results | 42 Java JUnit 5 unit and replay tests passing. |
| 12 | **Python Tests** | `docs/images/python-tests.png` | 4. Test Results | 9 Python pytest worker test cases passing. |
| 13 | **Monorepo Verification** | `docs/images/verify-all.png` | 5. Production Verification | Unified monorepo verification passing all 5 verification layers. |
| 14 | **Hermes CLI** | `docs/images/cli-help.png` | 6. Hermes CLI | Hermes interactive developer CLI menu and helper tools. |
| 15 | **Terraform Validation** | `docs/images/terraform-validate.png` | 7. Infrastructure Validation | Automated validation across all 18 Terraform infrastructure modules. |

---

## Architectural Verification Highlights

1. **Transactional Outbox Guarantee**:
   - Atomic $O(1)$ writes to DynamoDB event store table with outbox items.
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
