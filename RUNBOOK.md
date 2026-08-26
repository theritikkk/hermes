# Hermes — Runbook

This runbook covers every operational procedure needed to deploy, validate, and troubleshoot Hermes in a live AWS environment. It is the authoritative reference for on-call engineers.

**Architecture reference:** [`ARCHITECTURE.md`](ARCHITECTURE.md)\
**Automated smoke test:** [`scripts/smoke-test.sh`](scripts/smoke-test.sh)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [First-Time Deployment](#2-first-time-deployment)
3. [Updating Lambda Code](#3-updating-lambda-code)
4. [Updating Infrastructure](#4-updating-infrastructure)
5. [Smoke Test — Validate the Deployment](#5-smoke-test--validate-the-deployment)
6. [Observability — Where to Look](#6-observability--where-to-look)
7. [Troubleshooting Playbooks](#7-troubleshooting-playbooks)
8. [DLQ Management](#8-dlq-management)
9. [Disaster Recovery](#9-disaster-recovery)
10. [On-Call Escalation Matrix](#10-on-call-escalation-matrix)

---

## 1. Prerequisites

### Local tools (all environments)

| Tool | Version | Purpose |
|---|---|---|
| Terraform | ≥ 1.8.0 | Infrastructure provisioning |
| AWS CLI v2 | ≥ 2.15 | AWS API access, Lambda deploy |
| Node.js | ≥ 20 | TypeScript build |
| `jq` | ≥ 1.6 | JSON parsing in scripts |
| `curl` | any | HTTP testing |

### AWS credentials

```bash
aws configure            # or: export AWS_PROFILE=hermes-dev
aws sts get-caller-identity   # verify access
```

Required IAM permissions: `AdministratorAccess` or a custom policy covering Lambda, DynamoDB, Step Functions, EventBridge, SQS, IAM, KMS, API Gateway, CloudWatch Logs.

---

## 2. First-Time Deployment

> **Time estimate:** ~10 minutes (OpenSearch domain takes 8–10 min to become `Active`)

### Step 1 — Clone and install

```bash
git clone https://github.com/theritikkk/hermes
cd hermes
npm install
```

### Step 2 — Bootstrap Terraform

```bash
cd infra/environments/dev
terraform init
```

### Step 3 — Apply infrastructure

```bash
terraform apply
```

Terraform creates all infrastructure: KMS, DynamoDB, SQS, EventBridge, Step Functions, API Gateway, Lambda execution roles, CloudWatch alarms, Cognito, OpenSearch, S3.

Lambda functions are initially deployed with a **placeholder zip** that returns a stub response. The next step replaces them with real code.

### Step 4 — Build and deploy Lambda code

```bash
cd ../../..                             # back to repo root
./scripts/bundle-lambdas.sh             # compile TypeScript + vendor deps
AWS_REGION=ap-south-1 ./scripts/deploy-lambdas.sh dev
```

`deploy-lambdas.sh` updates the six critical-path Lambdas:
`command-api`, `query-api`, `validate-worker`, `ocr-worker`, `classify-worker`, `execution-projection`

The remaining Lambdas (`outbox-publisher`, `snapshot-trigger`, `dlq-handler`, `opensearch-projection`, `usage-projection`, `webhook-dispatcher`, `outbox-republisher`) stay on placeholder until their implementations are bundled.

### Step 5 — Validate

```bash
AWS_REGION=ap-south-1 ./scripts/smoke-test.sh
```

Expected output: `ALL SMOKE TEST LAYERS PASSED` with exit code 0.

---

## 3. Updating Lambda Code

Whenever TypeScript source changes:

```bash
./scripts/bundle-lambdas.sh
AWS_REGION=ap-south-1 ./scripts/deploy-lambdas.sh dev
```

Then run the smoke test to verify:

```bash
AWS_REGION=ap-south-1 ./scripts/smoke-test.sh
```

### How bundling works

`bundle-lambdas.sh`:
1. Runs `npm run build --workspaces` — compiles all TypeScript packages.
2. For each Lambda, copies `dist/*` and `package.json` into `infra/.build/<name>/`.
3. Runs `scripts/copy-deps.js` to vendor npm dependencies into `infra/.build/<name>/node_modules/`.
4. Zips the contents of `infra/.build/<name>/` (files at archive root — `handler.js` must be at `/`).

`deploy-lambdas.sh`:
1. Calls `aws lambda update-function-code --zip-file` for each Lambda.
2. Calls `aws lambda wait function-updated` before moving to the next.

### Adding a new Lambda to the bundle pipeline

1. Add a `bundle <name> <path>` line to `scripts/bundle-lambdas.sh`.
2. Add the name to the `LAMBDAS` array in `scripts/deploy-lambdas.sh`.
3. Change `filename` in `infra/environments/dev/main.tf` from `local.placeholder_zip` to the real zip path (or keep placeholder and rely on `deploy-lambdas.sh`).
4. Run `bundle-lambdas.sh` → `deploy-lambdas.sh` → `smoke-test.sh`.

---

## 4. Updating Infrastructure

```bash
cd infra/environments/dev
terraform plan    # review changes
terraform apply   # apply
```

After any IAM policy change, re-run the smoke test — IAM propagation can take up to 10 seconds.

> **Note:** `terraform apply` updates the placeholder zip, not the real Lambda code. Always run `deploy-lambdas.sh` after `terraform apply` if Lambda configuration changed.

### Adding KMS permissions to a Lambda

If a Lambda accesses an encrypted DynamoDB table or SQS queue, its `policy_json` must include:

```hcl
{
  Effect   = "Allow"
  Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
  Resource = module.kms.key_arn
}
```

`kms:Decrypt` — required for reads (DynamoDB `GetItem`, `Query`, SQS `ReceiveMessage`).  
`kms:GenerateDataKey` — required for writes (DynamoDB `PutItem`, `UpdateItem`, SQS `SendMessage`).

---

## 5. Smoke Test — Validate the Deployment

### Run (auto-resolve from Terraform outputs)

```bash
cd infra/environments/dev
AWS_REGION=ap-south-1 ../../../scripts/smoke-test.sh
```

### Run (explicit env vars)

```bash
AWS_REGION=ap-south-1 \
API_URL=https://<id>.execute-api.ap-south-1.amazonaws.com \
SFN_ARN=arn:aws:states:ap-south-1:<account>:stateMachine:hermes-dev-document-pipeline-v1 \
DLQ_URL=https://sqs.ap-south-1.amazonaws.com/<account>/hermes-dev-outbox-dlq \
./scripts/smoke-test.sh
```

### What it tests

| Layer | Check |
|---|---|
| 1 | `POST /assets` returns HTTP 202 with `executionId` |
| 2+3 | Step Functions execution reaches `SUCCEEDED` within 60s |
| 5 | `execution-read-model` contains the item (EventBridge → projection Lambda ran) |
| 8 | `GET /executions/{executionId}` returns HTTP 200 with correct `workflowName` |
| 7 | DLQ `ApproximateNumberOfMessages = 0` |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All layers passed |
| `1` | At least one assertion failed — see output for which layer and why |

---

## 6. Observability — Where to Look

### CloudWatch Logs

| Lambda | Log Group |
|---|---|
| command-api | `/aws/lambda/hermes-dev-command-api` |
| query-api | `/aws/lambda/hermes-dev-query-api` |
| validate-worker | `/aws/lambda/hermes-dev-validate-worker` |
| ocr-worker | `/aws/lambda/hermes-dev-ocr-worker` |
| classify-worker | `/aws/lambda/hermes-dev-classify-worker` |
| execution-projection | `/aws/lambda/hermes-dev-execution-projection` |
| outbox-publisher | `/aws/lambda/hermes-dev-outbox-publisher` |
| dlq-handler | `/aws/lambda/hermes-dev-dlq-handler` |

Tail logs in real time:

```bash
aws logs tail /aws/lambda/hermes-dev-command-api \
  --region ap-south-1 --follow
```

Filter for errors only:

```bash
aws logs tail /aws/lambda/hermes-dev-command-api \
  --region ap-south-1 --filter-pattern '"level":"ERROR"'
```

### Step Functions — execution history

```bash
# List recent executions
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:ap-south-1:<account>:stateMachine:hermes-dev-document-pipeline-v1 \
  --region ap-south-1 --max-results 5

# Get full execution history
aws stepfunctions get-execution-history \
  --execution-arn <execution-arn> \
  --region ap-south-1
```

### DynamoDB — inspect event store

```bash
# List events for an execution
aws dynamodb query \
  --table-name hermes-dev-event-store \
  --region ap-south-1 \
  --key-condition-expression "PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"EXEC#<executionId>"}}' \
  --output json | jq '.Items[] | {seq: .SK.S, type: .eventType.S}'
```

### DynamoDB — inspect read model

```bash
aws dynamodb scan \
  --table-name hermes-dev-execution-read-model \
  --region ap-south-1 \
  --filter-expression "contains(SK, :eid)" \
  --expression-attribute-values '{":eid":{"S":"<executionId>"}}' \
  --output json | jq '.Items[0]'
```

### DLQ depth

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/<account>/hermes-dev-outbox-dlq \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --region ap-south-1
```

---

## 7. Troubleshooting Playbooks

### `Runtime.ImportModuleError: Cannot find module 'handler'`

**Cause:** Lambda zip was built with files nested inside a subdirectory (e.g., `command-api/handler.js`) instead of at the archive root (`handler.js`).

**Fix:**

```bash
./scripts/bundle-lambdas.sh
AWS_REGION=ap-south-1 ./scripts/deploy-lambdas.sh dev
```

Check the zip structure before deploying:

```bash
unzip -l infra/.build/command-api.zip | grep handler.js
# Correct:   3795  handler.js
# Wrong:     3795  command-api/handler.js
```

---

### `AccessDeniedException` from KMS

**Cause:** A Lambda is reading or writing a KMS-encrypted DynamoDB table or SQS queue, but its execution role lacks `kms:Decrypt` or `kms:GenerateDataKey` on the CMK.

**Symptom in CloudWatch Logs:**
```
AccessDeniedException: User: ...assumed-role/hermes-dev-command-api-role/...
is not authorized to perform: kms:Decrypt on resource: arn:aws:kms:...
```

**Fix:** Add to the Lambda's `policy_json` in `infra/environments/dev/main.tf`:

```hcl
{
  Effect   = "Allow"
  Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
  Resource = module.kms.key_arn
}
```

Then:

```bash
cd infra/environments/dev && terraform apply
```

---

### `POST /assets` returns HTTP 500 `{"error":"internal error"}`

1. Check CloudWatch Logs for `command-api`:
   ```bash
   aws logs tail /aws/lambda/hermes-dev-command-api --region ap-south-1 --since 5m
   ```

2. Common causes:

   | Log message | Cause | Fix |
   |---|---|---|
   | `Cannot find module 'handler'` | Wrong zip structure | Re-bundle (`bundle-lambdas.sh`) |
   | `AccessDeniedException` (KMS) | Missing KMS IAM grant | Add `kms:Decrypt`/`kms:GenerateDataKey` to role |
   | `ResourceNotFoundException` (DynamoDB) | Wrong table name env var | Check `EVENT_STORE_TABLE` Lambda env var |
   | `AccessDeniedException` (DynamoDB) | Missing table action in policy | Add `dynamodb:PutItem`/`dynamodb:Query` |

---

### Step Functions execution not starting

1. Confirm EventBridge rule is `ENABLED`:
   ```bash
   aws events list-rules \
     --event-bus-name hermes-dev-events \
     --region ap-south-1 \
     --query 'Rules[*].{Name:Name,State:State}' --output table
   ```

2. Check the EventBridge rule target is the correct SFN ARN:
   ```bash
   aws events list-targets-by-rule \
     --rule hermes-dev-workflow-execution-started \
     --event-bus-name hermes-dev-events \
     --region ap-south-1
   ```

3. Verify `command-api` is publishing to the correct bus (`EVENT_BUS_NAME` env var):
   ```bash
   aws lambda get-function-configuration \
     --function-name hermes-dev-command-api \
     --region ap-south-1 \
     --query 'Environment.Variables'
   ```

---

### `InvalidParameterValueException` during `terraform apply` (Lambda creation)

**Cause:** Lambda execution role lacks `sqs:SendMessage` on its DLQ at `CreateFunction` time. AWS validates DLQ permissions synchronously.

**Symptom:** `Still creating...` repeated every 10s in the Terraform CLI.

**Fix:** Ensure `aws_iam_role_policy.dlq` exists in the Lambda module with `sqs:SendMessage` on `var.dlq_arn` and that `aws_lambda_function` has `depends_on` referencing it. The module at `infra/modules/lambda-function/main.tf` already includes this.

---

### Execution projection not writing to read model

1. Check `execution-projection` logs for errors:
   ```bash
   aws logs tail /aws/lambda/hermes-dev-execution-projection \
     --region ap-south-1 --since 10m
   ```

2. Verify the EventBridge rule targeting `execution-projection` exists and is `ENABLED`:
   ```bash
   aws events list-rules \
     --event-bus-name hermes-dev-events \
     --region ap-south-1
   ```

3. Confirm the Lambda has an event source mapping or EventBridge trigger:
   ```bash
   aws lambda list-event-source-mappings \
     --function-name hermes-dev-execution-projection \
     --region ap-south-1
   ```

---

## 8. DLQ Management

### Check depth

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/<account>/hermes-dev-outbox-dlq \
  --attribute-names ApproximateNumberOfMessages \
  --region ap-south-1
```

### Inspect messages (non-destructive)

```bash
aws sqs receive-message \
  --queue-url https://sqs.ap-south-1.amazonaws.com/<account>/hermes-dev-outbox-dlq \
  --max-number-of-messages 1 \
  --visibility-timeout 30 \
  --region ap-south-1 \
  --output json | jq .
```

### Redrive (manually re-queue a message)

```bash
aws sqs change-message-visibility \
  --queue-url https://sqs.ap-south-1.amazonaws.com/<account>/hermes-dev-outbox-dlq \
  --receipt-handle <handle> \
  --visibility-timeout 0 \
  --region ap-south-1
```

Setting visibility to 0 makes it immediately available for reprocessing by `dlq-handler`.

### Purge DLQ (irreversible — use only in dev)

```bash
aws sqs purge-queue \
  --queue-url https://sqs.ap-south-1.amazonaws.com/<account>/hermes-dev-outbox-dlq \
  --region ap-south-1
```

---

## 9. Production Hardening & Disaster Recovery

### Security & Hardening Controls

| Component | Protection Mechanism | Specification |
|---|---|---|
| **API Gateway WAFv2** | AWS WAFv2 Web ACL (`hermes-dev-api-waf`) | Rate Limiting (1,000 requests / 5 min per IP), AWS Managed Common Ruleset |
| **S3 Buckets** | Public Access Block & Lifecycle Configuration | Block all public access; non-current versions transition to `STANDARD_IA` at 30 days, `GLACIER` at 90 days, expire at 180 days |
| **KMS Customer Keys** | Automatic CMK Key Rotation | `enable_key_rotation = true` enabled on KMS Customer Managed Key |
| **Tenant Isolation** | Strict Application-Level Enforcer | Non-admin cross-tenant request prevention (`TenantIsolationError`) |
| **Role-Based Access** | Cognito User Pool Groups (`Admin`, `User`, `Service`) | M2M authentication & role privilege checks (`RBACError`) |

### Disaster Recovery (DR) Metrics

| Metric | Target | Description |
|---|---|---|
| **RPO (Recovery Point Objective)** | **< 1 Second** | DynamoDB Global Tables & Point-in-Time Recovery (PITR) continuously stream event store data |
| **RTO (Recovery Time Objective)** | **< 5 Minutes** | Multi-Region EventBridge routing & Step Functions workflow registry failover |

### DynamoDB Point-in-Time Recovery (PITR)

Both `event-store` and `execution-read-model` have PITR enabled. To restore:

```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name hermes-dev-event-store \
  --target-table-name hermes-dev-event-store-restored \
  --restore-date-time 2026-08-11T12:00:00Z \
  --region ap-south-1
```

After restore: update `EVENT_STORE_TABLE` env var on affected Lambdas, or swap the table via a Terraform variable.

> The `execution-read-model` is fully reconstructable from the event store by replaying all `WorkflowExecutionStarted` events through `execution-projection`. PITR is a fast-path convenience, not a hard requirement for the read model.

### Replay Read Model from Events

If the read model is corrupted or out of sync, replay by re-processing events from the event store (the source of truth). The `outbox-republisher` & `snapshot-trigger` handle continuous recovery. For the read model specifically, re-triggering `execution-projection` against all historical `WorkflowExecutionStarted` events reconstructs state with zero data loss.

---

## 10. On-Call Escalation Matrix

| Severity | Condition | Response SLA | Action |
|---|---|---|---|
| **SEV-1** | DLQ depth > 100 **or** `command-api` error rate > 5% **or** Step Functions execution failures > 10% | 15 minutes | Page primary on-call. Stop all releases. |
| **SEV-2** | DLQ depth > 0 **and** not draining **or** execution-projection lag > 5 minutes | 1 hour | Investigate `dlq-handler` logs. Check EventBridge rule state. |
| **SEV-3** | Any single Lambda `AccessDeniedException` | 4 hours | Add missing IAM/KMS grant, `terraform apply`, redeploy Lambda. |
| **SEV-4** | Smoke test failing in CI | Next business day | Run `bundle-lambdas.sh` + `deploy-lambdas.sh`. Check CloudWatch Logs. |

### First 5 minutes checklist (any incident)

```bash
# 1. Is the API responding?
curl -s -o /dev/null -w "%{http_code}" \
  -X POST $API_URL/assets \
  -H "Content-Type: application/json" \
  -d '{"s3Key":"healthcheck","workflowName":"document-pipeline-v1"}'

# 2. Are Lambda functions running the latest code?
aws lambda get-function-configuration \
  --function-name hermes-dev-command-api \
  --region ap-south-1 \
  --query '[CodeSha256, LastModified]'

# 3. Is DLQ growing?
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/<account>/hermes-dev-outbox-dlq \
  --attribute-names ApproximateNumberOfMessages --region ap-south-1

# 4. Did the last Step Functions execution succeed?
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:ap-south-1:<account>:stateMachine:hermes-dev-document-pipeline-v1 \
  --region ap-south-1 --max-results 1 \
  --query 'executions[0].{status:status,startDate:startDate}'
```

---

## 11. EventBridge Archive Replay Operational Runbook

Hermes provisions an immutable 90-day EventBridge Event Archive (`${local.prefix}-events-archive`) attached to the `hermes-dev-events` bus (`infra/modules/eventbridge/main.tf`).

### When to Initiate an Event Replay

Use event replay when:
1. A downstream projection Lambda (e.g. `execution-projection`, `opensearch-projection`) was down or misconfigured and missed event delivery.
2. A bug in a projection function was fixed, requiring historical read model state to be re-computed.
3. A disaster recovery or new region bring-up requires populating CQRS read models from historical integration events.

### Step 1 — Identify Replay Time Window & Event Types

Determine the start and end timestamp (ISO 8601 UTC) and event types to reprocess:

```bash
EXPORT_START="2026-08-12T00:00:00Z"
EXPORT_END="2026-08-12T14:00:00Z"
BUS_ARN="arn:aws:events:ap-south-1:<account_id>:event-bus/hermes-dev-events"
ARCHIVE_ARN="arn:aws:events:ap-south-1:<account_id>:archive/hermes-dev-events-archive"
```

### Step 2 — Start the Replay

Execute `aws events start-replay` with event-type filtering:

```bash
aws events start-replay \
  --event-source-arn "$ARCHIVE_ARN" \
  --destination "$BUS_ARN" \
  --replay-name "projection-recovery-$(date +%Y%m%d%H%M%S)" \
  --event-start-time "$EXPORT_START" \
  --event-end-time "$EXPORT_END" \
  --event-pattern '{"detail-type":["WorkflowExecutionStarted","StepCompleted","StepFailed","WorkflowExecutionCompleted"]}' \
  --region ap-south-1
```

### Step 3 — Monitor Replay Progress

Check replay status (`RUNNING`, `COMPLETED`, or `FAILED`):

```bash
aws events describe-replay \
  --replay-name "projection-recovery-<timestamp>" \
  --region ap-south-1
```

Or list all active replays:

```bash
aws events list-replays \
  --event-source-arn "$ARCHIVE_ARN" \
  --region ap-south-1
```

### Expected Replay Behavior & Idempotency Controls

- **Re-delivery**: EventBridge re-emits events into `hermes-dev-events` with original payload timestamps intact.
- **Consumer Idempotency**: All projection Lambdas (`execution-projection`, `opensearch-projection`, `usage-projection`) are idempotent. They check event sequence numbers and use conditional DynamoDB updates to avoid double-counting or overwriting newer state.
- **Step Functions Protection**: During replay, EventBridge targets for Step Functions use state-machine execution naming derived from `executionId`. Step Functions rejects duplicate execution names gracefully (`ExecutionAlreadyStarted`), preventing duplicate workflow triggers.

