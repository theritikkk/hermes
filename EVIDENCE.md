# Hermes v1.0.0 — Production-Inspired Engineering Evidence

This document provides a single index of all empirical engineering evidence, validation scripts, test suites, and operational guides across the Hermes platform.

---

## Evidence Checklist

| Evidence Category | Verification / Link | Status |
|---|---|---|
| **Automated CI/CD Validation** | [GitHub Actions Workflow](.github/workflows/ci.yml) |  Passing |
| **Infrastructure-as-Code Validation** | `terraform validate` across `dev` & `staging` |  Validated |
| **Unit & Integration Test Suite** | 39 tests across 6 workspaces (`npm test`) |  39 / 39 Passing |
| **Code Coverage** | V8 Experimental Coverage (`npm run test:coverage`) |  100% Core Domain & Store |
| **Concurrency & Invariants** | Property & Chaos Tests (`shared/domain`, `shared/event-store`) |  Validated |
| **Offline Integration Testing** | LocalStack emulation script ([`scripts/localstack-test.sh`](scripts/localstack-test.sh)) |  Functional |
| **Critical Path Smoke Test** | 8-layer critical path verification script ([`scripts/smoke-test.sh`](scripts/smoke-test.sh)) |  Prepared |
| **Load & SLA Performance Target** | k6 Load Test Suite ([`benchmarks/k6/load-test.js`](benchmarks/k6/load-test.js)) |  Scripted |
| **Evidence Capture Instructions** | Instructions for live AWS screenshots ([`SCREENSHOTS_INSTRUCTIONS.md`](SCREENSHOTS_INSTRUCTIONS.md)) |  Documented |

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
