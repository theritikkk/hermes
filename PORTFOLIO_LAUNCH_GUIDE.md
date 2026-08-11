# Hermes v1.0.0 — Portfolio Execution, Screenshot & LinkedIn Launch Guide

This step-by-step guide walks you through running the Hermes platform, executing tests and benchmarks, capturing genuine engineering evidence screenshots, updating the repository, and posting a high-impact architectural showcase on LinkedIn.

---

## Phase 1: Local Environment & Verification

First, verify that your local Node.js environment, dependencies, and unit/integration test suites are completely passing.

### 1. Install Dependencies & Build Workspaces
```bash
npm ci
npm run build
```

### 2. Run Test Suite & Coverage
```bash
npm test
npm run test:coverage
```
*Expected Output: 39 unit & integration tests passing across all 6 workspaces.*

---

## Phase 2: Deploy Infrastructure to AWS (or LocalStack)

To capture live metrics, X-Ray traces, and Step Functions execution graphs, deploy the Terraform stack to AWS.

### 1. Deploy Terraform Infrastructure
```bash
cd infra/environments/dev
terraform init
terraform apply -auto-approve
cd ../../..
```

### 2. Bundle & Deploy Lambda Functions
```bash
./scripts/bundle-lambdas.sh
AWS_REGION=ap-south-1 ./scripts/deploy-lambdas.sh dev
```

---

## Phase 3: Run Live Operations & Benchmarks

Generate real operational activity to populate CloudWatch, X-Ray, DynamoDB, and Step Functions console views.

### 1. Interactive Developer CLI
```bash
./scripts/dev.sh
```
*Use option 6 (Run Smoke Test) or option 5 (Tail Lambda Logs).*

### 2. Execute Critical Path Smoke Test
```bash
AWS_REGION=ap-south-1 ./scripts/smoke-test.sh
```
*This executes POST /assets -> EventBridge -> Step Functions state machine (validate -> ocr -> classify) -> DynamoDB read model.*

### 3. Run k6 Load Test (Generates CloudWatch & Latency Metrics)
```bash
# Obtain your HTTP API endpoint from Terraform outputs
export TARGET_URL=$(cd infra/environments/dev && terraform output -raw http_api_endpoint)

# Run k6 load test
k6 run --env TARGET_URL=$TARGET_URL benchmarks/k6/load-test.js

# Export raw JSON metrics to repository
k6 run --env TARGET_URL=$TARGET_URL --out json=benchmarks/k6/results.json benchmarks/k6/load-test.js
```

---

## Phase 4: Screenshot Capture Checklist

Capture the following 10 screenshots from the AWS Console & Terminal. Save them directly into the designated screenshots/ subdirectories.

| # | Target Console / View | Action / Detail | Save Path |
|---|---|---|---|
| 1 | **CloudWatch Dashboard** | Open hermes-dev-observability-dashboard. Capture metrics graphs. | `screenshots/cloudwatch/dashboard.png` |
| 2 | **X-Ray Service Map** | AWS X-Ray -> Traces -> Service Map (shows API Gateway -> Lambda -> DynamoDB -> EventBridge). | `screenshots/xray/service-map.png` |
| 3 | **X-Ray Trace Timeline** | AWS X-Ray -> Select a POST /assets trace -> Capture full duration timeline. | `screenshots/xray/trace-timeline.png` |
| 4 | **Step Functions Graph** | Step Functions -> hermes-dev-document-pipeline-v1 -> Capture green execution graph. | `screenshots/step-functions/execution-graph.png` |
| 5 | **DynamoDB Event Store** | DynamoDB -> Tables -> hermes-dev-event-store -> View Items (PK & SK zero-padded sequence). | `screenshots/dynamodb/event-store.png` |
| 6 | **DynamoDB Read Model** | DynamoDB -> Tables -> hermes-dev-execution-read-model -> View projected COMPLETED state. | `screenshots/dynamodb/read-model.png` |
| 7 | **EventBridge Rules** | EventBridge -> Event Buses -> hermes-dev-events -> View rule targets. | `screenshots/eventbridge/rules.png` |
| 8 | **Smoke Test Terminal** | Terminal output of ./scripts/smoke-test.sh showing green checkmarks. | `screenshots/api/smoke-test.png` |
| 9 | **Unit & Integration Tests** | Terminal output of npm test showing 39 / 39 passing. | `screenshots/api/unit-tests.png` |
| 10 | **Terraform State** | Terminal output of cd infra/environments/dev && terraform plan showing No changes. | `screenshots/api/terraform-plan.png` |

---

## Phase 5: Commit & Tag Release

Once screenshots are saved and benchmarks/k6/results.json is updated:

```bash
git add screenshots/ benchmarks/k6/results.json PORTFOLIO_LAUNCH_GUIDE.md
git commit -m "docs: attach live AWS evidence screenshots, k6 benchmark results, and portfolio launch guide"
git tag -fa v1.0.0 -m "Hermes v1.0.0 — Production-Inspired Serverless Workflow Platform"
git push origin main --tags
```

---

## Phase 6: LinkedIn Post Template

Copy, customize, and post the following update to LinkedIn to announce your project:

```text
Excited to release Hermes v1.0.0 — an Event-Sourced Serverless Workflow Orchestration Platform built natively on AWS!

When designing distributed backend systems, a major failure mode is dual-write data loss—writing database state and inline publishing to a message broker can cause inconsistency if either step fails.

To solve this, I built Hermes implementing the Transactional Outbox pattern, CQRS, and Step Functions orchestration.

Key Engineering & Architectural Highlights:
1. Transactional Outbox Pattern: Atomic writes to a single-table DynamoDB Event Store paired with asynchronous SQS stream propagation eliminate dual-write risks.
2. CQRS Architecture: O(1) event store writes are completely isolated from 6 query-optimized read models & OpenSearch projections.
3. Step Functions Orchestration: Multi-step pipeline execution (validate -> ocr -> classify) managed via native EventBridge target rules.
4. Security & Multitenancy: Cognito JWT authentication, tenant boundary enforcement, and STRIDE threat modeling.
5. Complete Infrastructure-as-Code: Modularized AWS Terraform stack (WAFv2, KMS CMK rotation, S3 Glacier lifecycles, SQS DLQ handling).

Verifiable Quality & Operational Evidence:
• 39 unit & integration tests passing across 6 monorepo workspaces
• Full AWS X-Ray distributed tracing & CloudWatch EMF metrics dashboard
• Zero-downtime event schema upcasting (v1 -> v2)

GitHub Repository: https://github.com/theritikkk/hermes

Special thanks to everyone reviewing distributed systems architectures! Would love your thoughts and feedback in the comments.

#AWS #Serverless #EventSourcing #CQRS #SystemDesign #TypeScript #Terraform #CloudArchitecture #BackendEngineering
```

---

## Summary Checklist

- [ ] npm test passes (39/39)
- [ ] Terraform applied & Lambdas deployed
- [ ] smoke-test.sh executed
- [ ] k6 load test executed & results.json updated
- [ ] 10 screenshots captured & saved in screenshots/
- [ ] git push origin main --tags executed
- [ ] LinkedIn post published with GitHub repo link
