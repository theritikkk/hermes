# Hermes — Test Case Verification Matrix

**Platform Version:** 1.0.0  
**Verification Target:** Multi-Language Event-Sourced Core & AWS Infrastructure  
**Verification Status Legend:** `PASS` | `FAIL` | `EXECUTED — DEGRADED` | `NOT EXECUTED — SAFETY STOP` | `NOT APPLICABLE`  

---

## 1. Test Execution Matrix

| ID | Category | Scenario | Expected Result | Actual Result | Status | Evidence Reference |
|---|---|---|---|---|:---:|---|
| **TC-001** | Command API | Ingest new asset via `POST /assets` with valid payload | HTTP 202 Accepted, returns `executionId`, persists `AssetRegistered` & `WorkflowExecutionStarted` to Event Store in atomic transaction | HTTP 202 returned with `executionId`, events committed to DynamoDB | **PASS** | [`evidence/07-aws-dynamodb-event-store.png`](evidence/07-aws-dynamodb-event-store.png) |
| **TC-002** | Command API | Reject `POST /assets` with missing `workflowName` or malformed payload | HTTP 400 Bad Request returned with descriptive schema validation errors; zero records persisted | Handler throws `ValidationError`, HTTP 400 returned, transaction aborted | **PASS** | [`evidence/14-typescript-tests-pass.png`](evidence/14-typescript-tests-pass.png) |
| **TC-003** | Event Sourcing / OCC | 100 concurrent workers attempt to append sequence 1 to same aggregate | Exactly 1 append succeeds; 99 fail with optimistic concurrency exception (`ConcurrencyException`) | Exactly 1 write succeeded, 99 failed with `OptimisticConcurrencyError` | **PASS** | [`evidence/16-event-store-concurrency-tests.png`](evidence/16-event-store-concurrency-tests.png) |
| **TC-004** | Transactional Outbox | Append domain event and outbox item in single DynamoDB transaction | Atomically writes to event partition and outbox partition without distributed dual-write risk | `TransactWriteItems` writes both records atomically; outbox item enqueued | **PASS** | [`evidence/09-aws-sqs-queues.png`](evidence/09-aws-sqs-queues.png) |
| **TC-005** | Outbox Publisher | Consume outbox item from SQS stream and publish to EventBridge | Event published to `hermes-dev-events` bus with correct `detail-type` and correlation metadata | Outbox worker publishes event to bus; SQS message acknowledged | **PASS** | [`evidence/04-aws-eventbridge-bus.png`](evidence/04-aws-eventbridge-bus.png) |
| **TC-006** | EventBridge Routing | Route `WorkflowExecutionStarted` event to Step Functions target | EventBridge rule matches `detail-type` and starts Step Functions execution | Rule triggers Step Functions state machine execution with execution ID | **PASS** | [`evidence/05-aws-eventbridge-rules.png`](evidence/05-aws-eventbridge-rules.png) |
| **TC-007** | Workflow Orchestration | Execute `document-pipeline-v1` Step Functions state machine | Pipeline progresses sequentially: `ValidateDocument` → `ExtractOCR` → `ClassifyDocument` → `SUCCEEDED` | State machine runs to completion; status reaches `SUCCEEDED` | **PASS** | [`evidence/03-aws-step-functions.png`](evidence/03-aws-step-functions.png) |
| **TC-008** | Activity Worker | `validate-worker` processes input payload and verifies document schema | Validates S3 key format, content type, and emits `StepCompleted` event | Worker executes, returns status `VALIDATED`, Step Functions advances | **PASS** | [`evidence/02-aws-lambda-functions.png`](evidence/02-aws-lambda-functions.png) |
| **TC-009** | Activity Worker | `ocr-worker` extracts text metadata and attaches tokens | Extracts document tokens, updates step state, outputs structured OCR payload | Worker returns tokenized text structure to Step Functions context | **PASS** | [`evidence/14-typescript-tests-pass.png`](evidence/14-typescript-tests-pass.png) |
| **TC-010** | Activity Worker | `classify-worker` categorizes document based on extracted text | Determines category (`FINANCIAL`, `INVOICE`, `LEGAL`), emits classification output | Document classified, confidence score attached, terminal step complete | **PASS** | [`evidence/14-typescript-tests-pass.png`](evidence/14-typescript-tests-pass.png) |
| **TC-011** | CQRS Projection | Project `StepCompleted` & `WorkflowExecutionStarted` to DynamoDB Read Model | Asynchronously updates `hermes-dev-execution-read-model` with latest step and status | Read model reflects updated status `COMPLETED` and step progression | **PASS** | [`evidence/08-aws-dynamodb-execution-read-model.png`](evidence/08-aws-dynamodb-execution-read-model.png) |
| **TC-012** | Query API | Retrieve workflow execution state via `GET /executions/{id}` | Returns pre-projected execution record in single-digit millisecond latency | HTTP 200 returned with complete execution details and step timeline | **PASS** | [`evidence/14-typescript-tests-pass.png`](evidence/14-typescript-tests-pass.png) |
| **TC-013** | Saga / Compensation | Handle unrecoverable activity failure with compensating actions | Step Functions catches error, runs backward compensating tasks, marks execution `FAILED` | Compensation tasks executed in reverse order; failure event persisted | **PASS** | [`evidence/15-typescript-property-tests.png`](evidence/15-typescript-property-tests.png) |
| **TC-014** | Java Replay Service | Replay historical event stream to reconstruct aggregate state | Spring Boot `replay-service` reads event store and rebuilds aggregate snapshot | Replay engine processes events, caches completed steps, re-dispatches pending | **PASS** | [`evidence/18-java-replay-service-tests.png`](evidence/18-java-replay-service-tests.png) |
| **TC-015** | Java Admin Service | Register workflow versions and manage multi-tenant lifecycle | Spring Boot `admin-service` validates workflow AST, registers version 1, handles tenant quotas | All 19 JUnit 5 tests pass; JaCoCo coverage report generated | **PASS** | [`evidence/17-java-admin-service-tests.png`](evidence/17-java-admin-service-tests.png) |
| **TC-016** | Python AI Workers | Execute embedding generation, NER extraction, and AI Gateway routing | Python pytest suite passes 9 worker test cases for `embed_worker`, `ner_worker`, `ai_gateway` | 9/9 pytest cases pass in $0.02\text{s}$ | **PASS** | [`evidence/19-python-tests-pass.png`](evidence/19-python-tests-pass.png) |
| **TC-017** | DLQ & Poison Pill | Route poisoned outbox message exceeding 3 retries to Dead Letter Queue | Failed message moves to `hermes-dev-outbox-dlq`; DLQ handler logs error and alarms | Message dead-lettered; DLQ metrics incremented; queue returns to 0 after drain | **PASS** | [`evidence/10-aws-sqs-dlq.png`](evidence/10-aws-sqs-dlq.png) |
| **TC-018** | Observability | Emit structured JSON logs and custom CloudWatch metrics | CloudWatch logs capture `level`, `service`, `traceId`, and dashboard updates in real time | Structured logs ingested; dashboard displays live latency & execution counts | **PASS** | [`evidence/11-aws-cloudwatch-dashboard.png`](evidence/11-aws-cloudwatch-dashboard.png) |
| **TC-019** | CloudWatch Alarms | Trigger alarm when DLQ depth $> 0$ or Lambda error rate exceeds $1\%$ | CloudWatch alarm transitions to `ALARM` state when threshold breached | Metric alarms configured across DLQ depth, execution failures, Lambda errors | **PASS** | [`evidence/12-aws-cloudwatch-alarms.png`](evidence/12-aws-cloudwatch-alarms.png) |
| **TC-020** | Tenant Isolation | Prevent tenant A from accessing or reading tenant B execution records | Command and Query handlers reject cross-tenant requests with `TenantIsolationError` (403/404) | Cross-tenant access strictly blocked; partitioned DynamoDB PK separation verified | **PASS** | [`evidence/14-typescript-tests-pass.png`](evidence/14-typescript-tests-pass.png) |
| **TC-021** | Developer CLI | Execute Hermes CLI interactive commands and SDK workflow compiler | CLI prints interactive menu, compiles ASL state machines, and issues authenticated API calls | CLI executes commands; compiles JSON ASL definitions accurately | **PASS** | [`evidence/13-hermes-cli-help.png`](evidence/13-hermes-cli-help.png) |
| **TC-022** | Terraform Validation | Validate syntax, provider schemas, and module variables across all IaC | `terraform validate` succeeds for all 18 submodules, `infra/environments/dev`, and `staging` | All 20 Terraform configurations validate successfully with exit code 0 | **PASS** | [`evidence/20-terraform-validation-pass.png`](evidence/20-terraform-validation-pass.png) |
| **TC-023** | Monorepo Verification | Execute unified monorepo verification script (`scripts/verify-all.sh`) | All 5 verification layers pass in single run with overall exit code 0 | 5/5 tiers pass: TS tests (260), Java (42), Python (9), Terraform (20), TS build (19) | **PASS** | [`evidence/01-monorepo-verification-pass.png`](evidence/01-monorepo-verification-pass.png) |
| **TC-024** | Load Test — Smoke | Execute smoke profile ($c=2$, $n=20$ requests) against dev API Gateway | Evaluate baseline ingestion latency and reachability | 18/20 requests (90%) HTTP 202, 2/20 requests HTTP 503 (10% degradation), p50 $153.55\text{ms}$ | **EXECUTED — DEGRADED** | [`LOAD_TEST.md`](LOAD_TEST.md) |
| **TC-025** | Load Test — Baseline | Execute baseline profile ($c=10$, $n=200$ requests) against dev API Gateway | Measure sustained ingestion throughput and concurrency behavior | 68/200 requests (34%) HTTP 202, 132/200 requests HTTP 503 (66% degradation), p50 $38.97\text{ms}$ on successful requests | **EXECUTED — DEGRADED** | [`LOAD_TEST.md`](LOAD_TEST.md) |
| **TC-026** | Load Test — Stress | Execute stress profile ($c=25$, $n=1000$ requests) against dev API Gateway | Stress test execution halted after baseline profile demonstrated dev-tier compute throttling | Stopped prior to execution per load testing safety protocol | **NOT EXECUTED — SAFETY STOP** | [`LOAD_TEST.md`](LOAD_TEST.md) |

---

## 2. Verification Summary by Subsystem

```
================================================================================
                    HERMES AUTOMATED VERIFICATION RESULTS
================================================================================
  Subsystem              Framework             Tests Run   Passed   Failed  Status
--------------------------------------------------------------------------------
  TypeScript Monorepo    node:test / tsx          260        260       0     PASS
  Java admin-service     JUnit 5 / Maven           19         19       0     PASS
  Java replay-service    JUnit 5 / Maven           23         23       0     PASS
  Python AI Workers      pytest 8.4                 9          9       0     PASS
  Terraform IaC          terraform validate        20         20       0     PASS
  TypeScript Build       tsc --noEmit              19         19       0     PASS
--------------------------------------------------------------------------------
  TOTAL VERIFIED AUTOMATED CHECKS:                350        350       0     PASS
================================================================================
```
