# Hermes — Testing Guide

Hermes ships tests in three languages across the monorepo. This guide is the single source of truth for running them: what exists, how to run each suite, what CI actually covers today, and how to add new tests. It was verified against the codebase directly (build + test run) rather than written from the script names alone.

---

## 1. Test Landscape at a Glance

| Language / Runtime | Location | Framework | Test Count | Run Command |
|---|---|---|---|---|
| TypeScript (Node 20+) | `shared/*`, `services/*` (13 packages) | Node's built-in `node:test` via `tsx` | 234 tests / 28 files | `npm test` |
| Java 25 (Spring Boot) | `services/admin-service`, `services/replay-service` | JUnit 5 (Jupiter) + Mockito + JaCoCo | 6 test classes | `mvn test` (per service) |
| Python 3 | `services/ai-workers` | `pytest` | 9 tests | `pytest` |

Beyond these unit/integration suites, the repo also includes:

- **Property-based tests** — `shared/domain/src/property.test.ts`, `shared/event-store/src/property-replay.test.ts` (invariant checks over randomized event sequences)
- **Chaos / concurrency tests** — `shared/event-store/src/chaos.test.ts`, `shared/event-store/src/concurrency.test.ts` (duplicate delivery, optimistic-concurrency conflicts)
- **Contract tests** — `shared/event-schemas/event-schemas.test.ts` (validates `WorkflowExecutionStarted` v1/v2/v3 payloads against their JSON Schemas)
- **Scripted integration suites** — `scripts/runtime-worker-tests.ts`, `scripts/e2e-validation.ts`, `scripts/system-component-verifier.ts`
- **Live smoke test** — `scripts/smoke-test.sh` (runs against a deployed AWS environment)
- **Chaos/load test** — `scripts/chaos-load-suite.py`
- **k6 load test** — `benchmarks/k6/load-test.js`
- **LocalStack integration runner** — `scripts/localstack-test.sh`

---

## 2. Prerequisites

- Node.js `>= 20` and npm `>= 10`
- Java 25 JDK + Maven (only needed for `admin-service` / `replay-service`)
- Python 3.10+ with `pip`

Install TypeScript dependencies once at the repo root (npm workspaces installs every package):

```bash
npm install
```

> ** Build before you test.** The service packages (`command-api`, `query-api`, all workers, all projections) import shared libraries like `@hermes/domain` and `@hermes/event-store` from their **compiled** `dist/` output, not their TypeScript source. Running `npm test` on a clean checkout without building first will fail with `Cannot find module '.../dist/index.js'`. Always run the build first:
>
> ```bash
> npm install
> npm run build
> npm test
> ```
>
> This is the same order `npm ci && npm run build && npm test` used in CI (`.github/workflows/ci.yml`) — don't skip the build step locally even for a quick test run.

---

## 3. Running the TypeScript Suite

```bash
npm run build   # compiles all shared/* packages that services depend on
npm test        # runs `node --import tsx --test src/**/*.test.ts` in every workspace
```

This executes all 234 tests across the 28 `*.test.ts` files listed above in roughly 1–2 seconds total (Node's native test runner, no Jest/Mocha overhead).

**Coverage** (experimental, Node's built-in V8 coverage):

```bash
npm run test:coverage
```

**Run a single workspace's tests** (useful while iterating on one service):

```bash
npm test -w @hermes/event-store
```

**Run a single test file directly:**

```bash
node --import tsx --test shared/event-store/src/chaos.test.ts
```

---

## 4. Running the Java Suite

`admin-service` and `replay-service` are Spring Boot services under `services/`, each with their own `pom.xml`, JUnit 5 + Mockito tests, and JaCoCo coverage reporting.

```bash
cd services/admin-service
mvn test

cd ../replay-service
mvn test
```

Test classes:
- `admin-service`: `VersioningTest`, `WorkflowDefinitionServiceTest`, `TenantServiceTest`
- `replay-service`: `SnapshotIntegrationTest`, `ReplayServiceTest`, `ReplayEngineTest`

JaCoCo HTML coverage reports are generated at `target/site/jacoco/index.html` in each service after `mvn test`.

> Both `pom.xml` files target Java 25 (`<java.version>25</java.version>`). Check your local JDK matches before running — a mismatched JDK will fail compilation before tests even run.

---

## 5. Running the Python Suite

The Python tests live in `services/ai-workers` and cover the `embed_worker`, `ner_worker`, and `ai_gateway` Lambda handlers.

```bash
cd services/ai-workers
pip install pytest --break-system-packages   # or use a virtualenv
PYTHONPATH=. pytest -v
```

`requirements.txt` also lists heavier ML dependencies (`spacy`, `sentence-transformers`, `langchain`, `pytesseract`) for the *production* handler code path. The current test suite (`test_ai_workers.py`) only exercises the stub/dummy-vector logic in the handlers and does **not** require those packages — `pytest` alone is sufficient to run the 9 existing tests. Install the full `requirements.txt` only if you're working on the real model-inference code paths.

---

## 6. Running Everything at Once

`scripts/verify-all.sh` runs all three language suites plus Terraform validation and a full TypeScript compile check, in one pass:

```bash
./scripts/verify-all.sh
```

Steps performed (each is independently pass/fail, and the script reports a summary at the end):
1. TypeScript unit/property/contract tests (`node --import tsx --test`)
2. Java tests for `admin-service` and `replay-service` (`mvn test`, with JaCoCo)
3. Python tests for `services/ai-workers` (`pytest`)
4. Terraform module validation (`scripts/terraform-validate.sh`)
5. TypeScript compilation check (`tsc --noEmit`) across every `tsconfig.json` in the monorepo

This is the most complete local check available and the closest thing to "does everything pass" — run it before opening a PR that touches more than one language.

---

## 7. Scripted Integration & Validation Suites

These are standalone scripts (not part of `npm test`) that exercise specific subsystems end-to-end using assertions rather than a test framework:

```bash
# Runtime worker handlers: outbox-publisher, snapshot-trigger, dlq-handler,
# webhook-dispatcher, outbox-republisher
npx tsx scripts/runtime-worker-tests.ts

# Full platform lifecycle: SDK compilation, version registry, event store
# replay, snapshotting, saga compensation, DLQ classification
npx tsx scripts/e2e-validation.ts

# Repository structure & cross-language compilation audit
npx tsx scripts/system-component-verifier.ts
```

---

## 8. Integration Testing with LocalStack

For integration tests against emulated AWS services (DynamoDB, SQS, EventBridge) without deploying to real AWS:

```bash
docker-compose -f docker-compose.localstack.yml up -d
./scripts/localstack-test.sh
```

---

## 9. Testing Against a Live Deployment

Once infrastructure is deployed (see `RUNBOOK.md` / `DEVELOPMENT.md`), two scripts exercise the deployed system directly:

**Smoke test** — 8-layer critical path check (`POST /assets` → EventBridge → Step Functions → workers → projection → `GET /executions/{id}` → DLQ depth):
```bash
AWS_REGION=ap-south-1 ./scripts/smoke-test.sh
```

**Chaos/load test** — concurrent asset registrations, outbox retries, idempotency-key collisions, transient failures:
```bash
python3 scripts/chaos-load-suite.py
```

**k6 load test** — ramps 0 → 50 virtual users over 3 minutes:
```bash
export TARGET_URL=<api-gateway-url>
k6 run benchmarks/k6/load-test.js
```

See `README.md`'s "Load Testing" section for the target SLA profile these tests are measured against.

All of the above can also be reached through the interactive CLI:
```bash
./scripts/dev.sh
```

---

## 10. What CI Actually Runs

Both `.github/workflows/ci.yml` and `.github/workflows/app-ci.yml` currently run **only** the TypeScript suite:

```yaml
npm ci
npm run build
npm test
npm run test:coverage   # ci.yml only, non-blocking
```

**The Java (`mvn test`) and Python (`pytest`) suites are not wired into either CI workflow today.** `scripts/verify-all.sh` runs all three locally, but nothing currently calls that script from GitHub Actions. If you're contributing to `admin-service`, `replay-service`, or `services/ai-workers`, run their tests manually (Sections 4–5 above, or `./scripts/verify-all.sh`) before opening a PR — CI will not catch regressions in those services.

---

## 11. Writing New Tests

**TypeScript** — colocate `*.test.ts` next to the code it covers, using `node:test`:
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Feature', () => {
  test('does the thing', () => {
    assert.equal(1 + 1, 2);
  });
});
```
Run it with `npm test` (auto-discovered by the workspace's `test` script) or directly via `node --import tsx --test path/to/file.test.ts`.

**Java** — standard JUnit 5 under `src/test/java/...`, mirroring the package of the class under test. Use Mockito for collaborators; `mvn test` picks up anything matching `*Test.java`.

**Python** — add `test_*` functions to `services/ai-workers/test_ai_workers.py` (or a new `test_*.py` file); `pytest` auto-discovers them.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '.../@hermes/*/dist/index.js'` | Ran `npm test` before `npm run build` | Run `npm run build` first |
| `mvn test` fails to compile | Local JDK version doesn't match `<java.version>25</java.version>` in `pom.xml` | Install/select JDK 25 |
| `pytest` import errors (`ModuleNotFoundError`) | Ran from repo root instead of `services/ai-workers`, or `PYTHONPATH` unset | `cd services/ai-workers && PYTHONPATH=. pytest -v` |
| `scripts/smoke-test.sh` / k6 fails to connect | No live deployment, or wrong `AWS_REGION` / `TARGET_URL` | Deploy first via `RUNBOOK.md`, then set the correct region/URL |