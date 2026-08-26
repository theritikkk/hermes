# Hermes — Production-Inspired Serverless Workflow Platform

[![Hermes Platform CI](https://github.com/theritikkk/hermes/actions/workflows/ci.yml/badge.svg)](https://github.com/theritikkk/hermes/actions/workflows/ci.yml)
![AWS Serverless](https://img.shields.io/badge/AWS-Serverless-orange?style=flat&logo=amazon-aws)
![Event Sourcing](https://img.shields.io/badge/Pattern-Event%20Sourcing-blue)
![CQRS](https://img.shields.io/badge/Pattern-CQRS-green)
![Release v1.0.0](https://img.shields.io/badge/Release-v1.0.0-success)

Hermes is a **production-inspired serverless workflow orchestration platform** demonstrating Event Sourcing, CQRS, the Transactional Outbox pattern, Step Functions state machine orchestration, distributed observability, multitenant security, and Infrastructure-as-Code on AWS.

It processes multi-step workflows (document ingestion, approval flows, ETL data pipelines) with guaranteed at-least-once event delivery, tenant isolation, role-based access control, distributed X-Ray tracing, and real-time observability.

## Runtime Architecture & Service Matrix

Hermes core is **100% TypeScript / Node 20 Lambda-native**, with explicit architectural specifications (ADRs) for multi-runtime expansion:

| Runtime | Role / Status | Implementation | Reason |
|---|---|---|---|
| **TypeScript / Node 20** | **Active Core Platform (100% Implemented & Deployed)** | 13 Lambda Services (`command-api`, `query-api`, `execution-projection`, `usage-projection`, `opensearch-projection`, `outbox-publisher`, `snapshot-trigger`, `dlq-handler`, `webhook-dispatcher`, `outbox-republisher`, `validate-worker`, `ocr-worker`, `classify-worker`) | Optimized for low-latency, I/O-bound workloads using Node.js 20 Lambda functions, with shared monorepo domain packages (`@hermes/*`). |
| **Java 25 + Spring Boot** | *Architectural Expansion Option* (ADR-014) | Long-running admin & time-travel services (`replay-service`, `admin-service`) | Enterprise Spring Security & Flyway relational migrations for long-running ECS tasks. |
| **Python** | *Architectural Expansion Option* (ADR-023) | ML Workers (`ocr_worker`, `embed_worker`, `ner_worker`) | PyTorch, spaCy, and sentence-transformers native ML libraries. |

---

## Architecture

```text
        +----------------------+
        |   Command API        |
        +----------+-----------+
                   |
                   v
           Event Store (DynamoDB)
                   |
            Transactional Outbox
                   |
                   v
             EventBridge Bus
      +------------+-------------+
      |                          |
      v                          v
Step Functions           Read Projections
      |                          |
      v                          v
Activity Workers         Query API
      |
      v
Event Store
```

### Detailed Component Flow

```text
[ Client / Tenant App ] 
         │  (JWT Token + x-tenant-id)
         ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ API Gateway HTTP API + AWS WAFv2 (Rate Limiting & AWS Managed Rules)   │
 └──────────────────────────────────┬─────────────────────────────────────┘
                                    │
                       ┌────────────┴────────────┐
                       ▼                         ▼
            ┌───────────────────┐       ┌───────────────────┐
            │   Command API     │       │     Query API     │
            │  (RegisterAsset)  │       │  (Read Model CQRS)│
            └──────────┬────────┘       └─────────▲─────────┘
                       │                          │
                       ▼                          │
       ┌───────────────────────────────┐          │
       │ DynamoDB Event Store (PITR)   │          │
       │ (TransactWrite + Outbox)      │          │
       └───────────────┬───────────────┘          │
                       │                          │
                       ▼                          │
       ┌───────────────────────────────┐          │
       │  DynamoDB Streams → SQS       │          │
       │  (outbox-publisher Lambda)    │          │
       └───────────────┬───────────────┘          │
                       │                          │
                       ▼                          │
       ┌───────────────────────────────┐          │
       │     EventBridge Event Bus     │          │
       │      (hermes-dev-events)      │          │
       └──────────┬─────────┬──────────┘          │
                  │         │                     │
                  │         ▼                     │
                  │   ┌──────────┐                │
                  │   │ Workers  │                │
                  │   └────┬─────┘                │
                  │        │ Step Results         │
                  │        └──────────┐           │
                  ▼                   ▼           │
     ┌────────────────────────┐  ┌────────────────┴─────────────┐
     │ Step Functions         │  │ Execution Projections       │
     │ Workflow State Machine │  │ (execution-read-model,      │
     │ (document-pipeline-v1) │  │  usage, audit, OpenSearch)  │
     └────────────────────────┘  └──────────────────────────────┘
```

---

## Quickstart

### 1. Run Workspace Unit Tests
```bash
npm install
npm run build
npm test
```
*Executes 260 unit, integration, property-based, chaos, and contract test cases across 57 suites in all TypeScript workspace packages via Node's native test runner in ~1–2s. The build step is required first — services import shared packages (`@hermes/domain`, `@hermes/event-store`, etc.) from their compiled `dist/` output. See [`TESTING.md`](TESTING.md) for the full testing guide, including the Java and Python test suites.*

### 2. Interactive Developer CLI
```bash
./scripts/dev.sh
```
*Interactive menu for testing, building, bundling, deploying, and log tailing.*

### 3. Deploy Infrastructure & Functions
```bash
cd infra/environments/dev
terraform apply -auto-approve

cd ../..
./scripts/bundle-lambdas.sh
AWS_REGION=ap-south-1 ./scripts/deploy-lambdas.sh dev
```

### 4. Execute 8-Layer Critical Path Smoke Test
```bash
AWS_REGION=ap-south-1 ./scripts/smoke-test.sh
```

### 5. Run the Full Cross-Language Verification Suite
```bash
./scripts/verify-all.sh
```
*Runs TypeScript, Java (`admin-service`, `replay-service`), and Python (`ai-workers`) tests plus Terraform validation in one pass — see [`TESTING.md`](TESTING.md).*

---

## Live Walkthrough Demo

Refer to [`DEMO.md`](DEMO.md) for a structured 10–15 minute step-by-step presentation script covering system overview, architecture, live request execution, Step Functions orchestration, CloudWatch observability, X-Ray tracing, and incident debugging.

---

## Key System Features

- **Transactional Outbox Pattern**: Atomic database writes + asynchronous SQS/EventBridge event delivery eliminates dual-write data loss.
- **CQRS Architecture**: Append-only event store writes separated from 6 query-optimized DynamoDB read models & OpenSearch.
- **Step Functions Process Manager**: Native state machine orchestration for multi-step worker pipelines (`validate` → `ocr` → `classify`).
- **Multitenant Isolation & RBAC**: Cognito JWT authentication, strict tenant boundary enforcement (`TenantIsolationError`), and role-based authorization (`Admin`, `User`, `Service`).
- **Distributed Observability**: AWS X-Ray active distributed tracing, CloudWatch EMF metrics, and Observability Dashboard (`hermes-dev-observability-dashboard`).
- **Infrastructure Security**: AWS WAFv2 rate limiting, S3 Glacier lifecycle rules, and KMS Customer Managed Key automatic rotation.

---

## Load Testing & Empirical Evidence

A native TypeScript load harness (`scripts/load-test.ts`) and k6 benchmark suite are provided:

- **Empirical Dev Load Test Report**: [`screenshots/aws/tests/test-03/LOAD_TEST.md`](screenshots/aws/tests/test-03/LOAD_TEST.md) — live observations for Smoke ($c=2$) and Baseline ($c=10$) profiles on AWS `dev` (`ap-south-1`).
- **Load Test Plan & Safety Controls**: [`screenshots/aws/tests/test-03/LOAD_TEST_PLAN.md`](screenshots/aws/tests/test-03/LOAD_TEST_PLAN.md) — concurrency profiles and circuit breaker limits.
- **Comprehensive Verification Package**: [`screenshots/aws/tests/test-03/README.md`](screenshots/aws/tests/test-03/README.md) — reviewer entry point with 24 curated screenshots.
- **k6 Load Test Script**: [`benchmarks/k6/load-test.js`](benchmarks/k6/load-test.js) — configurable k6 runner.

### Target SLA Profile (ap-south-1)

| Operation / Path | Target SLA |
|---|---|
| **`POST /assets` Ingestion** | p99 < 500 ms |
| **`GET /executions/{id}` CQRS Query** | p99 < 50 ms |
| **Full Workflow End-to-End** | p99 < 3,000 ms |
| **Error Rate (5xx)** | < 0.1% |

> These represent architectural SLA targets. Measured development environment results and CloudWatch observability are preserved in [`screenshots/aws/tests/test-03/LOAD_TEST.md`](screenshots/aws/tests/test-03/LOAD_TEST.md).

---

## Complete Documentation Sitemap & Interview Resources

Hermes includes complete architectural defense and interview preparation material:

- [**EVIDENCE.md**](EVIDENCE.md) — Central index of all empirical verification and architecture evidence
- [**TEST_PLAN.md**](screenshots/aws/tests/test-03/TEST_PLAN.md) — 15-section comprehensive test strategy
- [**TEST_CASES.md**](screenshots/aws/tests/test-03/TEST_CASES.md) — 26-scenario test verification matrix (TC-001 to TC-026)
- [**LOAD_TEST.md**](screenshots/aws/tests/test-03/LOAD_TEST.md) — Non-production load test execution report
- [**TESTING.md**](TESTING.md) — Full testing guide: TypeScript/Java/Python suites, coverage, and troubleshooting
- [**SLO.md**](SLO.md) — Service Level Objectives, SLIs, Error Budgets, and Burn Rate Alerts
- [**THREAT_MODEL.md**](THREAT_MODEL.md) — STRIDE Threat Model & Security Vulnerability Defense Analysis
- [**SCALING.md**](SCALING.md) — 10x, 100x, and 1000x Scaling Bottleneck Analysis & Remedies
- [**CAPACITY_PLANNING.md**](CAPACITY_PLANNING.md) — Capacity planning & calculations for 1M Workflows/Day
- [**SCHEMA_VERSIONING.md**](docs/SCHEMA_VERSIONING.md) — Event schema evolution (v1 → v2) & transparent upcaster migration
- [**COST_ESTIMATES.md**](COST_ESTIMATES.md) — Operational AWS cost breakdowns across Low, Mid, and High scale profiles
- [**ARCHITECTURE.md**](ARCHITECTURE.md) — Request flow diagrams, failure recovery flows & component mapping
- [**RUNBOOK.md**](RUNBOOK.md) — Deployment, troubleshooting playbooks, and disaster recovery procedures
- [**INTERVIEW_GUIDE.md**](INTERVIEW_GUIDE.md) — Architectural defense, technical Q&A, and elevator pitches
- [**TRADE_OFFS.md**](TRADE_OFFS.md) — Pros & Cons matrix for every architectural component
- [**DECISIONS.md**](DECISIONS.md) — Standardized Architecture Decision Records (ADRs 001–005)
- [**INCIDENTS.md**](INCIDENTS.md) — Incident post-mortems and Root Cause Analyses (RCA)
- [**DEVELOPMENT.md**](DEVELOPMENT.md) — Developer onboarding, sequence diagrams, and CLI reference
- [**CONTRIBUTING.md**](CONTRIBUTING.md) — Monorepo layout map and PR guidelines
- [**CHANGELOG.md**](CHANGELOG.md) — v1.0.0 Release Notes
