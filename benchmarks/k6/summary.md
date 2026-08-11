# Hermes — Load Test Summary

## Status: Target SLA Definition (Not Yet Measured Against Production)

> **Important**: The numbers below are **engineering SLA targets**, not measured production results.  
> To generate real results: deploy the stack, configure `TARGET_URL` in `load-test.js`, and run `k6 run benchmarks/k6/load-test.js`.  
> The raw `results.json` will be updated with real k6 output.

---

## How to Run

```bash
# Prerequisites: k6 installed (https://k6.io/docs/getting-started/installation/)
export TARGET_URL="https://<your-api-gateway-id>.execute-api.ap-south-1.amazonaws.com"
k6 run --env TARGET_URL=$TARGET_URL benchmarks/k6/load-test.js
```

---

## Target SLA Profile (ap-south-1)

| Metric | Target |
|---|---|
| **`POST /assets` p95 Latency** | < 300 ms |
| **`POST /assets` p99 Latency** | < 500 ms |
| **`GET /executions/{id}` p99 Latency** | < 50 ms |
| **Error Rate (5xx)** | < 0.1% |
| **Success Rate** | > 99.9% |

---

## Test Script

The k6 test script is at [`benchmarks/k6/load-test.js`](load-test.js).

It ramps from 0 to 50 VUs over 30s, holds for 3 minutes, then ramps down.  
Replace the `TARGET_URL` environment variable with your live API Gateway URL.
