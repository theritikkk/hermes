# Hermes — Testing Guide

Hermes ships tests across three programming languages in the monorepo. This guide provides instructions for executing each test suite, understanding automated CI/CD coverage, and verifying multi-tier cloud infrastructure.

---

## 1. Test Landscape at a Glance

| Language / Runtime | Location | Framework | Verified Test Count | Run Command |
|---|---|---|:---:|---|
| **TypeScript (Node 20+)** | `shared/*`, `services/*` | Node.js built-in `node:test` via `tsx` | **260 tests / 57 suites** | `npm test` |
| **Java 25 (Spring Boot)** | `services/admin-service`, `services/replay-service` | JUnit 5 (Jupiter) + Mockito + JaCoCo | **42 tests (6 test classes)** | `mvn test` (per service) |
| **Python 3** | `services/ai-workers` | `pytest 8.4` | **9 tests** | `pytest -v` |
| **Terraform IaC** | `infra/modules/*`, `infra/environments/*` | `terraform validate` | **20 configurations** | `./scripts/terraform-validate.sh` |
| **TypeScript Compilation** | Monorepo workspaces | `tsc --noEmit` | **19 packages** | Part of `./scripts/verify-all.sh` |

Beyond unit and integration suites, the repository includes:
- **Property-based tests** — `shared/domain/src/property.test.ts`, `shared/event-store/src/property-replay.test.ts` (invariant checks over randomized event streams via `fast-check`)
- **Chaos & Concurrency tests** — `shared/event-store/src/chaos.test.ts`, `shared/event-store/src/concurrency.test.ts` (duplicate delivery, optimistic concurrency conflicts with 100 racing workers)
- **Contract tests** — `shared/event-schemas/event-schemas.test.ts` (validates `WorkflowExecutionStarted` payload schemas across v1/v2/v3)
- **Live Non-Production Load Testing** — [`scripts/load-test.ts`](scripts/load-test.ts) (Smoke & Baseline execution profiles documented in [`screenshots/aws/tests/test-03/LOAD_TEST.md`](screenshots/aws/tests/test-03/LOAD_TEST.md))
- **Unified Monorepo Pipeline** — [`scripts/verify-all.sh`](scripts/verify-all.sh) (runs all 5 tiers with a single exit code)

---

## 2. Prerequisites

- Node.js `>= 20` and npm `>= 10`
- Java 25 JDK + Apache Maven (for `admin-service` and `replay-service`)
- Python 3.10+ with `pytest`
- Terraform `>= 1.8`

---

## 3. Running Test Suites

### 1. Unified Monorepo Pipeline (All 5 Tiers)
```bash
./scripts/verify-all.sh
```

### 2. TypeScript Suite (260 Tests / 57 Suites)
```bash
npm run build
npm test
```
*Direct runner command:*
```bash
node --import tsx --test $(find shared services -name "*.test.ts" | grep -v "node_modules" | grep -v ".build")
```

### 3. Java Spring Boot Services (42 Tests)
```bash
# Admin Service (19 tests)
cd services/admin-service && mvn test && cd ../..

# Replay Service (23 tests)
cd services/replay-service && mvn test && cd ../..
```

### 4. Python AI Workers (9 Tests)
```bash
cd services/ai-workers && PYTHONPATH=. pytest -v && cd ../..
```

### 5. Terraform Infrastructure Validation (20 Configurations)
```bash
./scripts/terraform-validate.sh
```

### 6. Live Non-Production Load Testing
```bash
# Dry run verification
npm run test:load -- --dry-run

# Run against deployed dev endpoint
export BASE_URL="https://<api-gateway-id>.execute-api.ap-south-1.amazonaws.com"
export PROFILE=smoke
npm run test:load -- --yes
```

---

## 4. Empirical Evidence Archive

All empirical evidence and verification artifacts are documented in:
- [**Test Plan & Verification Matrix**](screenshots/aws/tests/test-03/README.md)
- [**Load Test Execution Report**](screenshots/aws/tests/test-03/LOAD_TEST.md)
- [**Curated Evidence Screenshots**](screenshots/aws/tests/test-03/evidence/README.md)
- [**Evidence Index**](EVIDENCE.md)
