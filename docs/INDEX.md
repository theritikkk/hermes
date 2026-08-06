# Hermes Platform — Master Repository Directory & Sitemap

A comprehensive sitemap mapping every component, service, domain package, SDK module, infrastructure resource, and documentation file across the Hermes repository.

---

## 1. Services (`services/`)

### `command-api/` (Java 21 / Spring Boot)
- **Domain Aggregates & Saga**:
  - [`SagaManager.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/domain/saga/SagaManager.java) — Saga compensation LIFO orchestrator.
  - [`SagaExecution.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/domain/saga/SagaExecution.java) — Optimistic-locking saga state machine.
  - [`SagaDefinition.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/domain/saga/SagaDefinition.java) — Saga compensation mapping definition.
- **DLQ Management**:
  - [`DlqMessage.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/domain/dlq/DlqMessage.java) — DLQ message domain model & poison classifier.
  - [`DlqInspectionService.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/application/DlqInspectionService.java) — Safe peek, redrive, and audit purge implementation.
- **Infrastructure & Event Store**:
  - [`EventSchemaUpcaster.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/infrastructure/eventstore/EventSchemaUpcaster.java) — Schema evolution upcaster chain.
  - [`StructuredMetricsEmitter.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/infrastructure/observability/StructuredMetricsEmitter.java) — AWS CloudWatch EMF metric format publisher.
- **Java Client SDK**:
  - [`HermesClient.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/main/java/com/hermes/command/sdk/HermesClient.java) — Zero-dependency Java 21 SDK client.
- **Test Suites**:
  - [`SagaOrchestrationTest.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/test/java/com/hermes/command/domain/saga/SagaOrchestrationTest.java) — 14 Saga compensation tests.
  - [`DlqHandlerTest.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/command-api/src/test/java/com/hermes/command/domain/dlq/DlqHandlerTest.java) — 13 DLQ poison detection unit tests.

### `replay-service/` (Java 21 / Spring Boot)
- [`ExecutionStateProjector.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/replay-service/src/main/java/com/hermes/replay/application/ExecutionStateProjector.java) — Time-travel state machine & replay delta calculator.
- [`ReplayService.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/replay-service/src/main/java/com/hermes/replay/application/ReplayService.java) — Execution replay orchestrator with cached output injection.
- [`SnapshotStore.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/replay-service/src/main/java/com/hermes/replay/infrastructure/eventstore/SnapshotStore.java) — DynamoDB snapshot store repository.
- [`DynamoDbEventStoreReader.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/replay-service/src/main/java/com/hermes/replay/infrastructure/eventstore/DynamoDbEventStoreReader.java) — Snapshot-aware event stream reader.
- [`SnapshotIntegrationTest.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/replay-service/src/test/java/com/hermes/replay/application/SnapshotIntegrationTest.java) — 9 snapshot-aware replay integration tests.

### `admin-service/` (Java 21 / Spring Boot)
- [`WorkflowVersionRegistry.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/admin-service/src/main/java/com/hermes/admin/domain/WorkflowVersionRegistry.java) — Workflow definition version registry (DRAFT -> ACTIVE -> DEPRECATED).
- [`DlqController.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/admin-service/src/main/java/com/hermes/admin/api/DlqController.java) — ADMIN REST API for DLQ inspection and redrive.
- [`WorkflowTemplateLoader.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/admin-service/src/main/java/com/hermes/admin/application/WorkflowTemplateLoader.java) — Startup classpath template scanner.
- [`VersioningTest.java`](file:///Users/ritikraj/Documents/GitHub/hermes/services/admin-service/src/test/java/com/hermes/admin/domain/VersioningTest.java) — 24 versioning & upcasting tests.

---

## 2. Shared SDK & Developer CLI (`shared/sdk/typescript/`)

- [`workflow.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/shared/sdk/typescript/src/workflow.ts) — `WorkflowBuilder` DSL & `AslCompiler`.
- [`client.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/shared/sdk/typescript/src/client.ts) — Fetch-based TypeScript `HermesClient`.
- [`cli.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/shared/sdk/typescript/src/cli.ts) — `hermes` CLI executable binary.
- [`sdk.test.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/shared/sdk/typescript/src/sdk.test.ts) — 26 SDK unit tests.

---

## 3. Workflow ASL Templates (`workflows/templates/`)

- [`document-pipeline-v1.json`](file:///Users/ritikraj/Documents/GitHub/hermes/workflows/templates/document-pipeline-v1.json) — Legacy v1 pipeline.
- [`document-pipeline-v2.json`](file:///Users/ritikraj/Documents/GitHub/hermes/workflows/templates/document-pipeline-v2.json) — Production v2 ASL with Choice state skipping & parallel branches.
- [`approval-flow-v1.json`](file:///Users/ritikraj/Documents/GitHub/hermes/workflows/templates/approval-flow-v1.json) — Human-in-the-loop approval workflow.
- [`batch-etl-v1.json`](file:///Users/ritikraj/Documents/GitHub/hermes/workflows/templates/batch-etl-v1.json) — Map state batch processing workflow.

---

## 4. Automation & Validation Scripts (`scripts/`)

- [`e2e-validation.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/scripts/e2e-validation.ts) — Programmatic end-to-end platform validation script.
- [`load-benchmark-suite.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/scripts/load-benchmark-suite.ts) — High-throughput performance load benchmark.
- [`system-component-verifier.ts`](file:///Users/ritikraj/Documents/GitHub/hermes/scripts/system-component-verifier.ts) — 33-point repository component integrity audit.

---

## 5. Infrastructure & Terraform (`infra/`)

- [`infra/environments/dev/main.tf`](file:///Users/ritikraj/Documents/GitHub/hermes/infra/environments/dev/main.tf) — Dev environment configuration.
- [`infra/modules/workflow-registry/`](file:///Users/ritikraj/Documents/GitHub/hermes/infra/modules/workflow-registry/main.tf) — Step Functions multi-template state machine module.
- [`infra/modules/multi-region-dr/`](file:///Users/ritikraj/Documents/GitHub/hermes/infra/modules/multi-region-dr/main.tf) — DynamoDB Global Tables & S3 CRR multi-region DR module.
- [`infra/modules/cloudwatch-alarms/cloudwatch-dashboard.json`](file:///Users/ritikraj/Documents/GitHub/hermes/infra/modules/cloudwatch-alarms/cloudwatch-dashboard.json) — CloudWatch dashboard JSON.

---

## 6. Visual Presentation & UI (`web/`)

- [`web/dashboard.html`](file:///Users/ritikraj/Documents/GitHub/hermes/web/dashboard.html) — Interactive dark-mode web operator dashboard & replay timeline visualizer.

---

## 7. Documentation (`docs/`)

- [`hermes-design.md`](file:///Users/ritikraj/Documents/GitHub/hermes/docs/hermes-design.md) — Principal Engineer Design Document (v2).
- [`RUNBOOK.md`](file:///Users/ritikraj/Documents/GitHub/hermes/docs/RUNBOOK.md) — Operational SOPs & Alarm Playbooks.
- [`ARCHITECTURE_SUMMARY.md`](file:///Users/ritikraj/Documents/GitHub/hermes/docs/ARCHITECTURE_SUMMARY.md) — Single-Table Schema & AWS Architecture Reference.
- [`INTERVIEW_CHEAT_SHEET.md`](file:///Users/ritikraj/Documents/GitHub/hermes/docs/INTERVIEW_CHEAT_SHEET.md) — High-Yield Senior Engineering Interview Q&A.
- [`DIAGRAMS.md`](file:///Users/ritikraj/Documents/GitHub/hermes/docs/DIAGRAMS.md) — Mermaid Architectural Sequence & State Diagrams.
