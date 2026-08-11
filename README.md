# Hermes

An event-sourced workflow orchestration platform built natively on AWS.

Document processing is one example workflow. The platform runs any workflow that can be modeled as a sequence of activities — document pipelines, approval flows, ETL jobs, or custom processes registered via the activity registry.

---

## How it works

A client submits an asset (a document, a payload, a data object). The platform assigns it to a workflow, appends events to an immutable event store, and orchestrates the activity steps via AWS Step Functions. When each activity completes, it records the result back as a command. The final event drives the projection to the completed state.

```
Client → API Gateway → command-api (TypeScript, Lambda)
                            ↓
                     DynamoDB Event Store
                     (append-only, PITR, KMS, Streams)
                            ↓
                     DynamoDB Streams
                            ↓
                         SQS Queue                   ← buffer for at-least-once delivery
                            ↓
                    outbox-publisher Lambda          ← marks events PUBLISHED after delivery
                            ↓
                       EventBridge
                      /           \
             Step Functions     execution-projection Lambda
             (per-version ASL)       ↓
                  ↓            DynamoDB Read Model
           Activity Workers
           (Python Lambdas)
                  ↓
          POST /step-results → command-api
```

The read side reads only from the DynamoDB read model and, eventually, OpenSearch. It never touches the event store.

---

## Runtime boundaries

Three runtimes with explicit, justified boundaries. No runtime crosses into another's domain.

| Runtime | Services | Reason |
|---------|----------|--------|
| TypeScript + Node.js | `command-api`, `query-api`, lambda-workers (`outbox-publisher`, `snapshot-trigger`, `dlq-handler`, `webhook-dispatcher`, `outbox-republisher`), `activity-workers`, `event-projections` | Stateless, I/O-bound Lambda handlers. Node.js startup time under 100ms. npm workspace shares `@hermes/*` domain packages across all services. |
| Java 25 + Spring Boot | `replay-service`, `admin-service` | Spring Security handles Cognito JWT validation. Spring Data JPA + Flyway manages PostgreSQL schema. ECS Fargate long-running services. |
| Python | `ai-workers` (`ocr_worker`, `embed_worker`, `ner_worker`, `ai_gateway`) | AI/ML libraries (spaCy, sentence-transformers) are first-class Python. The Java and TypeScript equivalents do not exist at the same maturity level. |

See [ADR-013](docs/adr/013-nodejs-typescript-lambda-runtime.md), [ADR-014](docs/adr/014-java-spring-for-apis.md), [ADR-023](docs/adr/023-python-ai-workers.md).

---

## Key architectural decisions

Each row is a decision that had real alternatives. The ADR explains why the alternative was rejected.

| ADR | Decision | Problem it solves |
|-----|---------|------------------|
| [001](docs/adr/001-event-sourcing-for-execution-state.md) | Event sourcing | Execution state is a history, not a snapshot. Mutable state cannot be replayed or audited. |
| [002](docs/adr/002-cqrs-command-query-separation.md) | CQRS | The write model (event stream) and the read model (projection) have different access patterns and consistency requirements. |
| [003](docs/adr/003-dynamodb-event-store.md) | DynamoDB as event store | Lambda bursts produce concurrent writes. RDS connection pools exhaust under Lambda concurrency. DynamoDB has no connection model. |
| [006](docs/adr/006-step-functions-as-process-manager.md) | Step Functions as process manager | Durable, visual, versioned workflow execution. Not the system of record — that's the event store. |
| [012](docs/adr/012-outbox-for-reliable-publish.md) | Transactional outbox | Calling EventBridge inline after a DynamoDB write is a dual-write. If EventBridge fails, the event is silently lost. |
| [015](docs/adr/015-transact-write-for-event-append.md) | `TransactWriteItems` | Two separate `PutItem` calls for META + EVENT create a failure window that permanently corrupts the event stream. |
| [016](docs/adr/016-dynamodb-streams-outbox.md) | DynamoDB Streams → SQS → publisher | DynamoDB Streams alone do not retry on Lambda failure. SQS adds a DLQ, configurable backoff, and visibility timeout. |
| [017](docs/adr/017-tenant-isolation-jwt.md) | `tenantId` from JWT only | A `tenantId` field in the request body can be set by any caller. The JWT claim cannot be forged by the client. |

Full ADR index: [docs/adr/README.md](docs/adr/README.md)

---

## What was explicitly not added

A short list of things that were considered and deliberately omitted. The rationale is in the [ADR index](docs/adr/README.md).

- `dynamodb-enhanced` client — raw `DynamoDbClient` gives direct control over `TransactWriteItems` item attributes
- Inline EventBridge publish from command handlers — replaced by DynamoDB Streams outbox
- EventBridge Schema Registry — single producer + two internal consumers in Phase 1; governance is a Phase 3 concern
- Resilience4j circuit breakers — not wired in Phase 1; deferring until DynamoDB throttling is observed under load

---

## Repository layout

```
services/
  command-api/            TypeScript — command processing Lambda (asset ingestion, step results)
  query-api/              TypeScript — read-only query Lambda over DynamoDB projections
  replay-service/         Java 25 + Spring Boot — time-travel replay engine (ECS Fargate)
  admin-service/          Java 25 + Spring Boot — workflow registry, tenant management (ECS Fargate)
  lambda-workers/
    outbox-publisher/     TypeScript — DynamoDB Streams → SQS → EventBridge
    outbox-republisher/   TypeScript — republish failed/unpublished events
    snapshot-trigger/     TypeScript — N-events threshold → aggregate snapshot
    dlq-handler/          TypeScript — DLQ → CloudWatch metric + alert
    webhook-dispatcher/   TypeScript — terminal event webhook delivery
  activity-workers/
    validate-worker/      TypeScript — asset validation activity
    ocr-worker/           TypeScript — OCR text extraction activity
    classify-worker/      TypeScript — document classification activity
  event-projections/
    execution-projection/ TypeScript — EventBridge → DynamoDB read model
    opensearch-projection/ TypeScript — EventBridge → OpenSearch index
    usage-projection/     TypeScript — EventBridge → tenant usage counters
  ai-workers/             Python — AI gateway, embed, NER workers

shared/
  domain/                 TypeScript — event types, aggregate key helpers, commands
  event-store/            TypeScript — DynamoDB event store client, optimistic locking
  command-handlers/       TypeScript — asset ingestion and step result handlers
  observability/          TypeScript — structured JSON logger, CloudWatch EMF
  event-schemas/          JSON Schema v7 event payload definitions
  activity-runner/        TypeScript — generic activity step runner framework
  sdk/
    typescript/           WorkflowBuilder DSL, AslCompiler, HermesClient, CLI

workflows/
  templates/              Step Functions ASL definitions (versioned JSON)
  activities/             Activity metadata registry

infra/
  modules/                18 reusable Terraform modules
    dynamodb-table/       Table with Streams, PITR, KMS, TTL
    sqs-queue/            Queue + DLQ + access policy
    cloudwatch-alarms/    Alarm set + CloudWatch dashboard
    kms-key/              CMK with automatic rotation
    multi-region-dr/      DynamoDB Global Tables, S3 CRR, Route 53 failover
    workflow-registry/    Step Functions multi-template state machine
    rds-postgres/         Aurora PostgreSQL for admin-service
    and 11 more...
  environments/
    dev/                  Dev environment — all modules wired
    staging/              Staging environment

web/
  dashboard.html          Interactive dark-mode operator dashboard & replay visualizer

scripts/
  deploy-lambdas.sh       Lambda deployment script
  bundle-lambdas.sh       Lambda bundling script
  e2e-validation.ts       End-to-end platform validation
  load-benchmark-suite.ts Performance benchmark suite
  system-component-verifier.ts  Repository integrity audit
  chaos-load-suite.py     Chaos/load testing

docs/
  hermes-design.md        Full system design document
  ARCHITECTURE_SUMMARY.md Technical reference
  DIAGRAMS.md             Mermaid architecture diagrams
  INDEX.md                Repository sitemap
  RUNBOOK.md              Operator runbook & incident playbook
  INTERVIEW_CHEAT_SHEET.md  Interview preparation guide
  adr/                    21 Architecture Decision Records
```

---

## Phase 1 status

Phase 1 covers the core event processing path end-to-end.

- [x] `command-api` — TypeScript Lambda, command processing (asset ingestion, step results)
- [x] Event store — DynamoDB with `TransactWriteItems`, PITR, Streams, KMS
- [x] Outbox — DynamoDB Streams → SQS → `outbox-publisher` Lambda → EventBridge
- [x] Projection — `execution-projection` Lambda with atomic `UpdateExpression`
- [x] Tenant isolation — Cognito JWT → `TenantContextHolder` → DynamoDB condition expressions
- [x] Idempotency — `(tenantId, clientRequestId)` DynamoDB store, TTL 24h
- [x] Observability — structured JSON logs, Micrometer → CloudWatch metrics
- [x] Alarms — DLQ depth, EventBridge failures, DynamoDB errors → SNS
- [x] Snapshots — `snapshot-trigger` Lambda, `SNAP#` items in event store table
- [x] CI/CD — multi-runtime GitHub Actions (Java + TypeScript), Terraform plan on PR, deploy on merge

Phase 2 (completed):
- [x] `replay-service` — Java 25 + Spring Boot, execution replay engine with cached-output step skipping
- [x] `admin-service` — Java 25 + Spring Boot, tenant & workflow registry backed by RDS PostgreSQL
- [x] `query-api` — TypeScript Lambda, read projections & OpenSearch query integration
- [x] Cognito User Pool provisioning — Terraform multi-tenant JWT configuration
- [x] Python AI activity workers — `ocr-worker`, `classify-worker`, `embed-worker`, `ner-worker`, `ai-gateway` Container Lambdas
- [x] Event Projections — `opensearch-projection` & `usage-projection` TypeScript Lambdas

Phase 4 (completed):
- [x] Time-Travel Replay Engine — `ExecutionStateProjector` time-travel fold, `ReplayService` delta computation, snapshot-aware loading
- [x] Saga Compensation Engine — `SagaManager` LIFO orchestrator, optimistic locking aggregate, compensation idempotency
- [x] Fluent Workflow SDK — `WorkflowBuilder` DSL -> `AslCompiler` -> Step Functions ASL JSON (`shared/sdk/typescript`)
- [x] TypeScript Client SDK — `HermesClient` fetch-based client for starting executions, polling status, and replay
- [x] Workflow & Event Versioning — `WorkflowVersionRegistry` lifecycle (DRAFT -> ACTIVE -> DEPRECATED), execution version pinning, `EventSchemaUpcaster` payload migration
- [x] DLQ Operator Management — `DlqInspectionService`, poison message classification, peek listing, safe redrive & audit purge API (`DlqController`)
- [x] Production ASL Templates — `document-pipeline-v2`, `approval-flow-v1`, `batch-etl-v1`
- [x] Observability & Operations — CloudWatch EMF `StructuredMetricsEmitter`, `cloudwatch-dashboard.json`, `RUNBOOK.md`
- [x] Infrastructure — `workflow-registry` Terraform module wired in `dev/main.tf`

Phase 5 (completed):
- [x] Developer CLI Tool — `hermes` CLI for workflow registration, execution status querying, DLQ inspection, and replay triggering (`@hermes/sdk` CLI binary)
- [x] End-to-End System Validation — Programmatic validation suite (`scripts/e2e-validation.ts`) verifying full SDK compilation, version pinning, event store time-travel, saga LIFO rollback, and DLQ poison detection
- [x] Technical Architecture Reference — Principal engineer reference guide (`docs/ARCHITECTURE_SUMMARY.md`) documenting single-table DynamoDB design, CQRS pipeline, 4 core pillars, and AWS native technology justifications

Phase 6 (completed):
- [x] Performance & Scale Load Benchmarking — Execution fold latency & upcaster throughput benchmark suite (`scripts/load-benchmark-suite.ts`)
- [x] Multi-Region Disaster Recovery — Terraform DR module (`infra/modules/multi-region-dr/`) with DynamoDB Global Tables, S3 CRR, and Route 53 CloudWatch health-check failover
- [x] Senior Engineering Interview Cheat Sheet — High-yield interview Q&A guide (`docs/INTERVIEW_CHEAT_SHEET.md`) covering architecture trade-offs, edge cases, and technical justifications
- [x] Automated System Component Verifier — Repository audit script (`scripts/system-component-verifier.ts`) verifying 33/33 system files across 7 component layers

Phase 7 (completed):
- [x] Interactive Web Dashboard UI — Dark-mode glassmorphic web dashboard & replay timeline visualizer (`web/dashboard.html`)
- [x] System Architecture Diagrams — Mermaid sequence, saga state machine, and snapshot time-travel diagrams (`docs/DIAGRAMS.md`)
- [x] Master Directory Index — Complete repository sitemap and directory index (`docs/INDEX.md`)




---

## Running locally

```bash
# Install all workspace dependencies
npm install

# Build shared packages and all TypeScript services
npm run build

# Run tests
npm test

# Java services (replay-service, admin-service)
cd services/replay-service
mvn verify

cd services/admin-service
mvn verify
```

## Infrastructure

```bash
cd infra/environments/dev
terraform init
terraform plan
terraform apply
```

## Deploy

```bash
# Lambda workers (TypeScript)
./scripts/deploy-lambdas.sh dev

# Java services (after ECR push)
aws ecs update-service --cluster hermes-dev --service hermes-dev-replay-service --force-new-deployment
aws ecs update-service --cluster hermes-dev --service hermes-dev-admin-service --force-new-deployment
```
