# Hermes — Load Testing & Performance Plan

**Scope:** Performance, concurrency, and latency profiling for the Hermes Event-Sourced Platform on AWS.  
**Version:** 1.0.0  

---

## 1. Objectives

The load testing strategy evaluates the performance boundaries of Hermes under varying concurrency profiles. Specifically, it seeks to:

1. **Quantify Ingestion Throughput & Latency**: Measure `POST /assets` response times and verify whether DynamoDB `TransactWriteItems` + JWT validation stays within the target SLA ($p95 < 300\text{ms}$, $p99 < 500\text{ms}$).
2. **Validate Outbox Stream Backpressure**: Ensure high-throughput writes to the event store do not saturate the transactional outbox queue (`hermes-dev-outbox`) or cause DynamoDB throttling.
3. **Verify Concurrency Limits**: Validate that concurrent requests from multiple tenants do not encounter race conditions, aggregate sequence corruption, or partition key hot-spotting.
4. **Enforce Safety & Cost Controls**: Ensure load testing does not induce runaway cloud costs, infinite loops, or unthrottled Lambda concurrency spikes.

---

## 2. Architecture Under Load

```
                  ┌────────────────────────────────────────────────────────┐
                  │                Hermes Command Ingestion                │
                  └────────────────────────────────────────────────────────┘
                                              │
                                              ▼
[ Load Test Client ] ──(HTTPS POST /assets)──► [ Amazon API Gateway (HTTP API) ]
                                              │
                                              ▼
                                       [ Command API Lambda ]
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         [ DynamoDB Event Store ]                            [ DynamoDB Outbox ]
      (Aggregate Partition Append)                        (Outbox Partition Append)
```

Under load, the primary path tested is the **synchronous ingestion boundary** (`POST /assets` → Command API Lambda → DynamoDB `TransactWriteItems`). Downstream asynchronous consumers (Outbox Publisher, EventBridge bus, Step Functions state machines) process the generated event backlog via their respective pull/push integrations.

---

## 3. Performance SLA Targets

These targets reflect the architectural SLAs defined in `BENCHMARKS.md` for AWS region `ap-south-1`:

| Metric | Target SLA | Description |
|---|---|---|
| **Ingestion Latency (p50)** | $< 150\text{ ms}$ | Median end-to-end response time for `POST /assets` |
| **Ingestion Latency (p95)** | $< 300\text{ ms}$ | 95th percentile response time under baseline load |
| **Ingestion Latency (p99)** | $< 500\text{ ms}$ | 99th percentile response time including Lambda warm starts |
| **Read Model Query (p99)** | $< 50\text{ ms}$ | $O(1)$ read-model retrieval via `GET /executions/{id}` |
| **Error Rate (5xx)** | $< 0.1\%$ | Server error rate under rated load |
| **Success Rate (2xx)** | $> 99.9\%$ | Accepted/processed request proportion |

---

## 4. Test Profiles & Concurrency Matrix

> [!NOTE]
> **Defined Profiles vs. Executed Results**: The profiles below define the planned benchmark parameters. See [`LOAD_TEST.md`](LOAD_TEST.md) for actual executed results (Smoke and Baseline executed; Stress not executed due to safety stop).

| Profile | Concurrency | Total Requests | Max Duration | Target RPS | Purpose |
|---|:---:|:---:|:---:|:---:|---|
| **Smoke** | 2 workers | 20 requests | $30\text{ s}$ | $> 10\text{ req/s}$ | Sanity check: validates endpoint reachability, auth, and basic latency |
| **Baseline** | 10 workers | 200 requests | $60\text{ s}$ | $> 40\text{ req/s}$ | Standard operating load: profiles steady-state latency and connection pooling |
| **Stress** | 25 workers | 1,000 requests | $180\text{ s}$ | $> 80\text{ req/s}$ | Peak load: evaluates DynamoDB transaction bursting and concurrency behavior |

---

## 5. Safety Guardrails & Cost Protection

Because Hermes runs on live AWS serverless infrastructure, load testing incorporates strict safety guardrails:

1. **Explicit `BASE_URL` Requirement**: The test runner rejects empty, placeholder, or default production URLs. An explicit environment variable (`BASE_URL`) must be supplied.
2. **Non-Production Confirmation**: Execution requires `--yes` or `CONFIRM_NON_PROD=true` to prevent accidental execution against production.
3. **Hard Concurrency Ceiling**: Concurrency is capped at a maximum of 50 workers to prevent sudden AWS service quota exhaustion.
4. **Circuit Breaker Abort**: If the cumulative error rate exceeds $50\%$ across 20 consecutive requests, the harness immediately halts execution to prevent resource flooding.
5. **Isolated Tenant Partitioning**: Load tests run under a dedicated tenant ID (`tenant-load-test` or `tenant-benchmark`) to keep benchmark data segregated from operational data.

---

## 6. Execution Instructions

### Option A: Built-in Node.js Harness (Zero Dependencies)

```bash
# 1. Validate harness logic with simulated dry-run:
npm run test:load -- --dry-run

# 2. Run Smoke Profile against deployed staging endpoint:
export BASE_URL="https://<api-gateway-id>.execute-api.ap-south-1.amazonaws.com"
export PROFILE=smoke
npm run test:load -- --yes

# 3. Run Baseline Profile:
export PROFILE=baseline
npm run test:load -- --yes

# 4. Run Stress Profile:
export PROFILE=stress
npm run test:load -- --yes
```

### Option B: k6 Load Test Suite

```bash
# Prerequisites: k6 installed (https://k6.io)
export TARGET_URL="https://<api-gateway-id>.execute-api.ap-south-1.amazonaws.com"
k6 run --env TARGET_URL=$TARGET_URL benchmarks/k6/load-test.js
```
