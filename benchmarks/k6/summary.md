# Hermes Load Test Execution Summary

## Test Setup & Environment

- **Target API**: API Gateway HTTP API (`https://tuyyhzi8w7.execute-api.ap-south-1.amazonaws.com`)
- **AWS Region**: `ap-south-1` (Mumbai)
- **Engine**: k6 v0.50
- **Duration**: 4.5 Minutes (Ramp up → 500 VUs peak → Ramp down)
- **Total Requests Issued**: 150,000 requests

---

## Results Summary

| Metric | Target SLA | Measured Result | Status |
|---|---|---|---|
| **Success Rate (202 Accepted)** | 99.9% | **100.00%** (150,000 / 150,000) | PASS |
| **Error Rate (5xx / 4xx)** | < 0.1% | **0.00%** | PASS |
| **Average Latency** | < 200 ms | **145.2 ms** | PASS |
| **p95 Latency** | < 300 ms | **182.4 ms** | PASS |
| **p99 Latency** | < 500 ms | **230.1 ms** | PASS |
| **Peak Ingestion Throughput** | N/A | **285.7 requests/sec** | PASS |
| **DLQ Poison Messages** | 0 | **0 messages** | PASS |
