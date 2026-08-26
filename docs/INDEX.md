# Hermes Platform  Master Repository Directory & Sitemap

A comprehensive sitemap mapping every component, service, domain package, SDK module, infrastructure resource, and documentation file across the Hermes repository.

---

## 1. Services (`services/`)

### `command-api/` (TypeScript / Node.js Lambda)
- [`handler.ts`](../services/command-api/dist/handler.js)  AWS Lambda handler for command processing.
  - `POST /assets`  Asset ingestion command.
  - `POST /step-results`  Step result recording from activity workers.
- **Dependencies**: `@hermes/domain`, `@hermes/event-store`, `@hermes/command-handlers`, `@hermes/observability`.

### `query-api/` (TypeScript / Node.js Lambda)
- [`handler.ts`](../services/query-api/src/handler.ts)  AWS Lambda handler for read-only queries.
  - `GET /executions/{executionId}`  Execution detail lookup from DynamoDB read model.
- **Dependencies**: `@hermes/domain`, `@hermes/observability`.

### `replay-service/` (Java 25 / Spring Boot)
- [`ExecutionStateProjector.java`](../services/replay-service/src/main/java/com/hermes/replay/application/ExecutionStateProjector.java)  Time-travel state machine & replay delta calculator.
- [`ReplayService.java`](../services/replay-service/src/main/java/com/hermes/replay/application/ReplayService.java)  Execution replay orchestrator with cached output injection.
- [`ReplayController.java`](../services/replay-service/src/main/java/com/hermes/replay/api/ReplayController.java)  REST API: `POST /api/v1/replay`, `POST /api/v1/replay/executions/{executionId}`.
- [`SnapshotStore.java`](../services/replay-service/src/main/java/com/hermes/replay/infrastructure/eventstore/SnapshotStore.java)  DynamoDB snapshot store repository.
- [`DynamoDbEventStoreReader.java`](../services/replay-service/src/main/java/com/hermes/replay/infrastructure/eventstore/DynamoDbEventStoreReader.java)  Snapshot-aware event stream reader.
- **Tests**: [`SnapshotIntegrationTest.java`](../services/replay-service/src/test/java/com/hermes/replay/application/SnapshotIntegrationTest.java), [`ReplayServiceTest.java`](../services/replay-service/src/test/java/com/hermes/replay/application/ReplayServiceTest.java), [`ReplayEngineTest.java`](../services/replay-service/src/test/java/com/hermes/replay/application/ReplayEngineTest.java).

### `admin-service/` (Java 25 / Spring Boot)
- [`WorkflowVersionRegistry.java`](../services/admin-service/src/main/java/com/hermes/admin/domain/WorkflowVersionRegistry.java)  Workflow definition version registry (DRAFT -> ACTIVE -> DEPRECATED).
- [`WorkflowRegistryController.java`](../services/admin-service/src/main/java/com/hermes/admin/api/WorkflowRegistryController.java)  REST API: register, activate, deprecate workflows.
- [`ActivityRegistryController.java`](../services/admin-service/src/main/java/com/hermes/admin/api/ActivityRegistryController.java)  REST API: register and list platform activities.
- [`TenantController.java`](../services/admin-service/src/main/java/com/hermes/admin/api/TenantController.java)  REST API: create, list, suspend tenants.
- [`WebhookController.java`](../services/admin-service/src/main/java/com/hermes/admin/api/WebhookController.java)  Webhook management.
- [`WorkflowTemplateLoader.java`](../services/admin-service/src/main/java/com/hermes/admin/application/WorkflowTemplateLoader.java)  Startup classpath template scanner.
- **Tests**: [`VersioningTest.java`](../services/admin-service/src/test/java/com/hermes/admin/domain/VersioningTest.java), [`WorkflowDefinitionServiceTest.java`](../services/admin-service/src/test/java/com/hermes/admin/application/WorkflowDefinitionServiceTest.java), [`TenantServiceTest.java`](../services/admin-service/src/test/java/com/hermes/admin/application/TenantServiceTest.java).

### `lambda-workers/` (TypeScript / Node.js Lambdas)
- `outbox-publisher/`  DynamoDB Streams  SQS  EventBridge publisher.
- `outbox-republisher/`  Republish failed/unpublished events.
- `snapshot-trigger/`  Creates aggregate snapshot items (`SNAP#`) every 50 events.
- `dlq-handler/`  Dead letter queue processing, poison message classification.
- `webhook-dispatcher/`  HTTP webhook delivery on terminal execution events.

### `activity-workers/` (TypeScript / Node.js Lambdas)
- `validate-worker/`  Asset validation activity.
- `ocr-worker/`  OCR text extraction activity.
- `classify-worker/`  Document classification activity.

### `event-projections/` (TypeScript / Node.js Lambdas)
- `execution-projection/`  Projects domain events onto DynamoDB read model.
- `opensearch-projection/`  Indexes execution data into Amazon OpenSearch.
- `usage-projection/`  Projects execution counts to tenant usage counters.

### `ai-workers/` (Python)
- `ai_gateway/`  Provider abstraction layer for routing AI requests.
- `embed_worker/`  Text vector embedding generation.
- `ner_worker/`  Named entity recognition.

---

## 2. Shared Packages (`shared/`)

### `domain/`
- [`index.ts`](../shared/domain/src/index.ts)  Event types, aggregate keys, commands, payloads (`EventEnvelope`, `RegisterAssetCommand`, `RecordStepResultCommand`).

### `event-store/`
- [`index.ts`](../shared/event-store/src/index.ts)  `DynamoEventStore` with optimistic concurrency, `EventBridgePublisher`.

### `command-handlers/`
- [`index.ts`](../shared/command-handlers/src/index.ts)  `handleRegisterAsset()`, `handleRecordStepResult()`.

### `observability/`
- [`index.ts`](../shared/observability/src/index.ts)  Structured JSON logger with CloudWatch EMF support.

### `event-schemas/`
- JSON Schema v7 payload definitions (`StepCompleted.v1.json`, `WorkflowExecutionStarted.v1/v2/v3.json`).

### `activity-runner/`
- [`index.ts`](../shared/activity-runner/src/index.ts)  `runActivity()` high-order wrapper for Lambda activities.

### `sdk/typescript/`
- [`workflow.ts`](../shared/sdk/typescript/src/workflow.ts)  `WorkflowBuilder` DSL & `AslCompiler`.
- [`client.ts`](../shared/sdk/typescript/src/client.ts)  Fetch-based TypeScript `HermesClient`.
- [`cli.ts`](../shared/sdk/typescript/src/cli.ts)  `hermes` CLI executable binary.



---

## 3. Workflow ASL Templates (`workflows/templates/`)

- [`document-pipeline-v1.json`](../workflows/templates/document-pipeline-v1.json)  Legacy v1 pipeline.
- [`document-pipeline-v2.json`](../workflows/templates/document-pipeline-v2.json)  Production v2 ASL with Choice state skipping & parallel branches.
- [`approval-flow-v1.json`](../workflows/templates/approval-flow-v1.json)  Human-in-the-loop approval workflow.
- [`batch-etl-v1.json`](../workflows/templates/batch-etl-v1.json)  Map state batch processing workflow.

---

## 4. Activity Registry (`workflows/activities/`)

- [`registry.json`](../workflows/activities/registry.json)  Platform activity metadata registry (schemas, timeouts, retry policies).

---

## 5. Automation & Validation Scripts (`scripts/`)

- [`deploy-lambdas.sh`](../scripts/deploy-lambdas.sh)  Lambda deployment script.
- [`bundle-lambdas.sh`](../scripts/bundle-lambdas.sh)  Lambda bundling script.
- [`copy-deps.js`](../scripts/copy-deps.js)  Dependency copy utility.
- [`e2e-validation.ts`](../scripts/e2e-validation.ts)  End-to-end platform validation script.
- [`load-benchmark-suite.ts`](../scripts/load-benchmark-suite.ts)  High-throughput performance benchmark.
- [`system-component-verifier.ts`](../scripts/system-component-verifier.ts)  33-point repository component integrity audit.
- [`runtime-worker-tests.ts`](../scripts/runtime-worker-tests.ts)  Runtime worker test suite.
- [`chaos-load-suite.py`](../scripts/chaos-load-suite.py)  Chaos and load testing suite.

---

## 6. Infrastructure & Terraform (`infra/`)

### Modules (`infra/modules/`)
- `cloudwatch-alarms/`  CloudWatch alarm metrics + [`cloudwatch-dashboard.json`](../infra/modules/cloudwatch-alarms/cloudwatch-dashboard.json).
- `cognito-user-pool/`  Cognito user pool & OAuth2 client configuration.
- `dynamodb-table/`  Event store & read model DynamoDB table resources.
- `eventbridge/`  EventBridge bus configuration.
- `eventbridge-sfn-role/`  IAM role for EventBridge  Step Functions.
- `eventbridge-sfn-target/`  EventBridge rule with direct Step Functions invocation.
- `http-api/`  API Gateway v2 HTTP API definitions.
- `kms-key/`  CMK with automatic rotation.
- `lambda/`  Lambda IAM execution role.
- `lambda-function/`  Standardized Lambda function resource definition.
- `multi-region-dr/`  DynamoDB Global Tables, S3 CRR, Route 53 failover.
- `opensearch/`  Amazon OpenSearch cluster.
- `rds-postgres/`  Aurora PostgreSQL cluster for admin-service.
- `s3-bucket/`  Asset and artifact storage bucket.
- `sfn-exec-role/`  Step Functions state machine execution role.
- `sns-topic/`  Operational alert topic.
- `sqs-queue/`  SQS outbox queue + DLQ.
- `workflow-registry/`  Step Functions multi-template state machine.

### Environments (`infra/environments/`)
- [`dev/main.tf`](../infra/environments/dev/main.tf)  Dev environment configuration.
- [`staging/main.tf`](../infra/environments/staging/main.tf)  Staging environment configuration.

---

## 7. CI/CD Workflows (`.github/workflows/`)

- [`app-ci.yml`](../.github/workflows/app-ci.yml)  Application CI: build, test, lint for all workspaces + Java services.
- [`deploy-dev.yml`](../.github/workflows/deploy-dev.yml)  Deploy TypeScript Lambdas and update ECS services.
- [`infra-ci.yml`](../.github/workflows/infra-ci.yml)  Terraform plan on PR, apply on merge.
- [`security-scan.yml`](../.github/workflows/security-scan.yml)  npm audit, OWASP dependency check, TruffleHog secret scan.

---

## 8. Visual Presentation & UI (`web/`)

- [`dashboard.html`](../web/dashboard.html)  Interactive dark-mode web operator dashboard & replay timeline visualizer.

---

## 9. Documentation (`docs/`)

- [`hermes-design.md`](../docs/hermes-design.md)  Principal Engineer Design Document (v2).
- [`ARCHITECTURE_SUMMARY.md`](../docs/ARCHITECTURE_SUMMARY.md)  Single-Table Schema & AWS Architecture Reference.
- [`DIAGRAMS.md`](../docs/DIAGRAMS.md)  Mermaid Architectural Sequence & State Diagrams.
- [`RUNBOOK.md`](../docs/RUNBOOK.md)  Operational SOPs & Alarm Playbooks.
- [`INTERVIEW_CHEAT_SHEET.md`](../docs/INTERVIEW_CHEAT_SHEET.md)  High-Yield Senior Engineering Interview Q&A.
- [`INDEX.md`](../docs/INDEX.md)  This file: Master repository directory & sitemap.
- [`known-issues.md`](../docs/known-issues.md)  Known issues and workarounds.
- [`build-investigation.md`](../docs/build-investigation.md)  Java build & upgrade investigation report.
- [`adr/`](../docs/adr/README.md)  21 Architecture Decision Records.
