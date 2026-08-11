# Hermes — Performance Engineering & SLA Targets

> **Integrity Notice**: This document contains **engineering SLA targets and architectural latency estimates**, not measured production results.  
> To generate real benchmark data, run the k6 load test script against your live deployment:  
> `export TARGET_URL=<api-gateway-url> && k6 run benchmarks/k6/load-test.js`

---

## 1. Engineering SLA Targets per Component

These targets are derived from the architectural design (DynamoDB single-digit ms reads, Lambda cold-start budget, EventBridge propagation SLA). They should be validated against your deployment.

| Operation / Path | Target SLA | Architectural Basis |
|---|---|---|
| **`POST /assets` Ingestion** | p99 < 500 ms | DynamoDB `TransactWriteItems` (~5ms) + JWT validation + Lambda overhead |
| **Outbox Stream Propagation** | p99 < 200 ms | SQS batch poll interval (20s max) + EventBridge `PutEvents` (~2ms) |
| **EventBridge → Step Functions Trigger** | p99 < 100 ms | Native EventBridge target rule (no additional Lambda invocation) |
| **Full Workflow End-to-End** | p99 < 5,000 ms | 3 sequential activity workers × Lambda + Step Functions state transitions |
| **`GET /executions/{id}` Query** | p99 < 50 ms | O(1) DynamoDB `GetItem` from pre-projected read model |

---

## 2. Load Test Setup

The k6 load test script is at [`benchmarks/k6/load-test.js`](benchmarks/k6/load-test.js).

### How to generate real results

```bash
# 1. Install k6: https://k6.io/docs/getting-started/installation/
# 2. Set your live API Gateway URL
export TARGET_URL="https://<api-gateway-id>.execute-api.ap-south-1.amazonaws.com"

# 3. Run the load test
k6 run --env TARGET_URL=$TARGET_URL benchmarks/k6/load-test.js

# 4. Export raw results
k6 run --env TARGET_URL=$TARGET_URL --out json=benchmarks/k6/results.json benchmarks/k6/load-test.js
```

The raw results file (`benchmarks/k6/results.json`) in this repository contains a placeholder template showing the expected JSON schema. It will be replaced with real output once the load test is run against a live deployment.

---

## 3. Why Not Include Fabricated Numbers?

This project explicitly avoids presenting fabricated benchmark numbers as real measurements. The architectural patterns implemented here (Transactional Outbox, CQRS, DynamoDB single-table event store, EventBridge native targets) are well-understood in the industry with documented latency profiles.

If you are evaluating this project and want to verify latency claims, deploy the stack and run the k6 script above.
