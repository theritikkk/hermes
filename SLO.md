# Hermes — Service Level Objectives (SLO)

This document defines the Service Level Indicators (SLIs), Service Level Objectives (SLOs), Error Budgets, and Burn Rate alerts for Hermes in accordance with Google SRE principles.

---

## 1. Core SLO Matrix

| Service Boundary | SLI (Metric) | SLO Target | Measurement Window | Error Budget |
|---|---|---|---|---|
| **Command API Availability** | Successful `POST /assets` requests (HTTP 202/400 vs 5xx) | **99.95%** | 30 Days (Rolling) | 0.05% (~21.6 min downtime/mo) |
| **Command API Ingestion Latency** | `POST /assets` request duration | **p99 < 300 ms** | 30 Days (Rolling) | 1.0% of requests > 300ms |
| **CQRS Read Query Latency** | `GET /executions/{id}` request duration | **p99 < 50 ms** | 30 Days (Rolling) | 1.0% of requests > 50ms |
| **Event Projection Lag** | EventBridge publish timestamp to DynamoDB read model write timestamp | **p99 < 500 ms** | 30 Days (Rolling) | 0.1% of events > 500ms lag |
| **Event Durability** | Unhandled lost outbox events (DLQ poison count) | **100.00%** (Zero lost events) | 30 Days (Rolling) | **0 Lost Events** |
| **Mean Time to Recovery (MTTR)** | Incident detection to service restoration | **< 5 Minutes** | Per Incident | N/A |

---

## 2. Error Budget Burn Rate Alerting

| Burn Rate Multiplier | Error Budget Consumption Rate | Alert Severity | Notification Channel | SLA Action |
|---|---|---|---|---|
| **14.4x** | 2% in 1 Hour | **SEV-1** | PagerDuty / On-Call Phone | Immediate Pager, Freeze Releases |
| **6.0x** | 5% in 6 Hours | **SEV-2** | Slack `#hermes-ops-alerts` | On-call investigation within 1 hour |
| **1.0x** | 100% in 30 Days | **SEV-3** | Jira Ticket | Sprint prioritization for reliability |
