# Hermes Evidence Archive — Curated Artifacts

This directory contains **24 curated, high-fidelity empirical screenshots** demonstrating the end-to-end functionality, AWS serverless infrastructure, multi-tier test suites, and live non-production load test observability of the **Hermes** platform.

All artifacts in this directory are non-destructively organized from empirical captures:
1. Artifacts `01` through `20` are curated from the baseline archive at `screenshots/aws/tests/test-01/`.
2. Artifacts `21` through `24` are curated from live AWS Console monitoring during the `ap-south-1` non-production load test run.
3. Secondary or redundant captures are preserved in `evidence/archive/`.

---

## 1. Curated Evidence Inventory

| Final Filename | Original Filename | Category | What It Proves | Direct Evidence |
|---|---|---|---|:---:|
| `01-monorepo-verification-pass.png` | `Screenshot 2026-08-12 at 16.32.11.png` | REPOSITORY VERIFICATION EVIDENCE | Unified pipeline (`./scripts/verify-all.sh`) passing all 5 tiers (TypeScript, Java, Python, Terraform, TS build) with exit code 0 | **YES** |
| `02-aws-lambda-functions.png` | `Screenshot 2026-08-12 at 16.34.12.png` | AWS CONFIGURATION EVIDENCE | 12 deployed Hermes microservices and worker functions running in AWS region `ap-south-1` | **YES** |
| `03-aws-step-functions.png` | `Screenshot 2026-08-12 at 16.34.37.png` | AWS CONFIGURATION EVIDENCE | Active `document-pipeline-v1` state machine orchestration definition and execution engine | **YES** |
| `04-aws-eventbridge-bus.png` | `Screenshot 2026-08-12 at 16.35.04.png` | AWS CONFIGURATION EVIDENCE | Custom `hermes-dev-events` event bus configured with an enabled 90-day event archive | **YES** |
| `05-aws-eventbridge-rules.png` | `Screenshot 2026-08-12 at 16.35.13.png` | AWS CONFIGURATION EVIDENCE | Content-filtered routing rules dispatching workflow events to targets | **YES** |
| `06-aws-dynamodb-tables.png` | `Screenshot 2026-08-12 at 16.35.50.png` | AWS CONFIGURATION EVIDENCE | All 6 single-table DynamoDB instances deployed in `ap-south-1` | **YES** |
| `07-aws-dynamodb-event-store.png` | `Screenshot 2026-08-12 at 16.36.36.png` | AWS CONFIGURATION EVIDENCE | Event-sourced transaction items with sequential versioning, aggregate IDs, and tenant keys in DynamoDB | **YES** |
| `08-aws-dynamodb-execution-read-model.png` | `Screenshot 2026-08-12 at 16.36.43.png` | AWS CONFIGURATION EVIDENCE | CQRS projected execution state items populated asynchronously by the execution-projection worker | **YES** |
| `09-aws-sqs-queues.png` | `Screenshot 2026-08-12 at 16.40.40.png` | AWS CONFIGURATION EVIDENCE | Transactional outbox queue (`hermes-dev-outbox`) and Dead Letter Queue (`hermes-dev-outbox-dlq`) | **YES** |
| `10-aws-sqs-dlq.png` | `Screenshot 2026-08-12 at 16.41.28.png` | AWS CONFIGURATION EVIDENCE | Dead Letter Queue details demonstrating 0 visible messages under healthy operations | **YES** |
| `11-aws-cloudwatch-dashboard.png` | `Screenshot 2026-08-12 at 16.39.53.png` | AWS OBSERVABILITY EVIDENCE | `hermes-dev-observability-dashboard` with live graphs for workflow duration and API latency | **YES** |
| `12-aws-cloudwatch-alarms.png` | `Screenshot 2026-08-12 at 16.39.44.png` | AWS OBSERVABILITY EVIDENCE | CloudWatch metric alarms monitoring DLQ depth ($>0$), Lambda runtime errors, and SFN failures | **YES** |
| `13-hermes-cli-help.png` | `Screenshot 2026-08-12 at 16.29.53.png` | REPOSITORY VERIFICATION EVIDENCE | Hermes TypeScript CLI (`@hermes/cli`) interactive help menu and workflow command options | **YES** |
| `14-typescript-tests-pass.png` | `Screenshot 2026-08-13 at 16.23.08.png` | REPOSITORY VERIFICATION EVIDENCE | 260 unit, integration, and contract tests across 57 suites passing with 0 failures via `node:test` | **YES** |
| `15-typescript-property-tests.png` | `Screenshot 2026-08-13 at 16.23.12.png` | REPOSITORY VERIFICATION EVIDENCE | Property-based testing (`fast-check`) verifying domain invariants over 100+ randomized event streams | **YES** |
| `16-event-store-concurrency-tests.png` | `Screenshot 2026-08-13 at 16.17.29.png` | REPOSITORY VERIFICATION EVIDENCE | Optimistic concurrency control: 100 concurrent workers race for sequence 1, 1 succeeds, 99 fail with OCC exception | **YES** |
| `17-java-admin-service-tests.png` | `Screenshot 2026-08-13 at 16.24.33.png` | REPOSITORY VERIFICATION EVIDENCE | `services/admin-service` Maven JUnit 5 test suite passing 19/19 tests with JaCoCo reports | **YES** |
| `18-java-replay-service-tests.png` | `Screenshot 2026-08-13 at 16.24.45.png` | REPOSITORY VERIFICATION EVIDENCE | `services/replay-service` Maven JUnit 5 test suite passing 23/23 tests (ReplayEngine, Snapshots) | **YES** |
| `19-python-tests-pass.png` | `Screenshot 2026-08-13 at 16.25.16.png` | REPOSITORY VERIFICATION EVIDENCE | `services/ai-workers` pytest suite passing 9/9 worker test cases (embed, NER, AI gateway) | **YES** |
| `20-terraform-validation-pass.png` | `Screenshot 2026-08-13 at 16.27.06.png` | REPOSITORY VERIFICATION EVIDENCE | Automated Terraform validation (`terraform validate`) passing across all 18 submodules, `dev`, `staging` | **YES** |
| `21-load-test-cloudwatch-lambda-metrics.png` | `Screenshot 2026-08-26 at 19.44.55.png` | LIVE LOAD-TEST AWS OBSERVABILITY | CloudWatch Lambda metrics for `hermes-dev-command-api` (13:40–14:00 UTC) showing Invocations, Duration, and 0.0 Errors | **YES** |
| `22-load-test-cloudwatch-lambda-throttles.png` | `Screenshot 2026-08-26 at 19.32.03.png` | LIVE LOAD-TEST AWS OBSERVABILITY | CloudWatch monitoring graph for `hermes-dev-command-api` showing `Throttles [max: 134]` during burst execution | **YES** |
| `23-load-test-api-gateway-route-integration.png` | `Screenshot 2026-08-26 at 19.34.45.png` | LIVE LOAD-TEST AWS CONFIGURATION | HTTP API Gateway `POST /assets` route integration attached to `hermes-dev-command-api` Lambda function | **YES** |
| `24-load-test-cloudwatch-log-streams.png` | `Screenshot 2026-08-26 at 19.46.34.png` | LIVE LOAD-TEST AWS OBSERVABILITY | CloudWatch log group `/aws/lambda/hermes-dev-command-api` showing 18 active log streams generated on 2026/08/26 | **YES** |

---

## 2. Live Load Test Screenshot Details & Non-Claims

| File | Source & Time Window | What It Proves | What It Does NOT Prove |
|---|---|---|---|
| `21-load-test-cloudwatch-lambda-metrics.png` | AWS CloudWatch Console (13:40–14:00 UTC) | Shows aggregate Lambda runtime invocations, duration, and 0.0 application errors during non-prod load test window | Does not prove 1:1 request reconciliation with client harness or sub-second boundaries |
| `22-load-test-cloudwatch-lambda-throttles.png` | AWS CloudWatch Console (11:30–14:00 UTC) | Shows Lambda concurrency throttles observed on `hermes-dev-command-api` during burst execution | Does not prove throttling was the sole cause of every individual HTTP 503 response |
| `23-load-test-api-gateway-route-integration.png` | AWS API Gateway Console | Confirms `POST /assets` routes directly to `hermes-dev-command-api` Lambda function | Does not prove total API Gateway request counts or latency metrics |
| `24-load-test-cloudwatch-log-streams.png` | AWS CloudWatch Console | Shows 18 distinct Lambda execution container log streams generated on 2026/08/26 | Shows container concurrency; does not display log line contents without opening streams |

---

## 3. Archived / Unselected Captures (`evidence/archive/`)

The following 7 captures are preserved in `evidence/archive/` as secondary/redundant captures:
- `Screenshot 2026-08-26 at 19.24.37.png` (Dashboard overview; redundant with `11-aws-cloudwatch-dashboard.png`)
- `Screenshot 2026-08-26 at 19.29.42.png` (API Gateway routes list; superseded by route integration `23-load-test-api-gateway-route-integration.png`)
- `Screenshot 2026-08-26 at 19.30.27.png` (Generic Lambda list; redundant with `02-aws-lambda-functions.png`)
- `Screenshot 2026-08-26 at 19.30.57.png` (Lambda code editor tab overview)
- `Screenshot 2026-08-26 at 19.31.52.png` (1-hour Lambda view; superseded by 40-min custom view `21-load-test-cloudwatch-lambda-metrics.png`)
- `Screenshot 2026-08-26 at 19.34.03.png` (API Gateway default stage metrics)
- `Screenshot 2026-08-26 at 19.43.57.png` (Intermediate custom range; superseded by `21-load-test-cloudwatch-lambda-metrics.png`)

---

## 4. Security & Data Integrity Policy

1. **Zero Credential Exposure**: No screenshots contain unmasked AWS account access keys (`AKIA...`), secret access keys, database passwords, or private signing keys.
2. **Real AWS Deployment**: Console captures reflect the live non-production deployment in AWS region `ap-south-1` (`hermes-dev-*` resources).
3. **No Synthetic Benchmarks**: No screenshots contain fabricated latency numbers or synthetic load graphs.
