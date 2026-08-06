# Hermes Operator Runbook & Incident Playbook

This runbook defines standard operating procedures, paging escalations, and incident response playbooks for engineers operating the Hermes Event-Sourced Workflow Platform.

---

## 1. On-Call Escalation & Severity Matrix

| Severity | Threshold / Condition | Response SLA | Target Persona |
|---|---|---|---|
| **SEV-1** | DLQ Depth > 100 OR Command API p99 > 2.5s OR Event Store Write Error Rate > 5% | 15 Minutes | Primary On-Call Engineer |
| **SEV-2** | Saga Compensation Rate > 10% OR Replay Job Failure Rate > 5% | 1 Hour | Secondary / Platform Engineer |
| **SEV-3** | Single tenant rate-limit throttling OR DLQ Depth > 0 | 4 Hours | On-Duty Operator |

---

## 2. Alarm Playbooks

### Playbook A: High DLQ Depth (`HermesHighDlqDepth`)
- **Alarm Trigger**: `ApproximateNumberOfMessagesVisible > 0` on `hermes-dev-dlq`.
- **Immediate Action**:
  1. Authenticate to `admin-service` and run:
     ```bash
     curl -X GET -H "Authorization: Bearer $JWT" https://admin.hermes.internal/api/v1/dlq?maxMessages=20
     ```
  2. Inspect `isPoisonMessage` flags and `failureReason` field.
  3. If failure is due to transient dependency outage (e.g. S3 timeout):
     ```bash
     curl -X POST -H "Authorization: Bearer $JWT" -H "X-Operator-ID: $USER" \
       -d '{"receiptHandle":"$HANDLE","body":"$BODY"}' \
       https://admin.hermes.internal/api/v1/dlq/$MSG_ID/redrive
     ```
  4. If message is corrupted / malformed (poison message):
     ```bash
     curl -X DELETE -H "Authorization: Bearer $JWT" -H "X-Operator-ID: $USER" \
       -d '{"receiptHandle":"$HANDLE","originalEventId":"$EVT_ID","tenantId":"$TENANT","eventType":"$TYPE","reason":"Corrupted payload"}' \
       https://admin.hermes.internal/api/v1/dlq/$MSG_ID
     ```

### Playbook B: High Saga Compensation Rate (`HermesHighSagaCompensationRate`)
- **Alarm Trigger**: `SagaCompensationTriggered > 10` in 5 minutes.
- **Immediate Action**:
  1. Query `command-api` application logs for `[SagaManager] LIFO Compensation triggered`.
  2. Differentiate step failures (e.g., OCR model OOM vs downstream 3rd party API down).
  3. Fix upstream activity worker or issue a point-in-time execution replay via `replay-service`.

### Playbook C: Event Store Condition Check Failure (`HermesDynamoDbWriteErrors`)
- **Alarm Trigger**: DynamoDB `TransactionCanceledException` spike.
- **Immediate Action**:
  1. Inspect whether optimistic locking versions or sequence collision triggers are firing.
  2. Verify tenant concurrency controls.

---

## 3. Replay Operating Procedures

To perform a partial execution replay from a specific failed step:

```bash
curl -X POST https://replay.hermes.internal/replay \
  -H "Authorization: Bearer $JWT" \
  -H "X-Tenant-ID: tenant-acme" \
  -H "Content-Type: application/json" \
  -d '{
    "executionId": "exec-9921",
    "fromStep": "ocr",
    "skipCompletedSteps": true,
    "reason": "Re-running after OCR worker deployment fix"
  }'
```

---

## 4. Disaster Recovery & Database Procedures

- **DynamoDB Point-In-Time Restore (PITR)**:
  ```bash
  aws dynamodb restore-table-to-point-in-time \
    --source-table-name hermes-dev-event-store \
    --target-table-name hermes-dev-event-store-restored \
    --restore-date-time 2026-08-06T09:00:00Z
  ```
- **Aurora PostgreSQL Failover**:
  ```bash
  aws rds failover-db-cluster --db-cluster-identifier hermes-dev-postgres-cluster
  ```
