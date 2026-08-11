# SCREENSHOTS_INSTRUCTIONS.md

# Hermes v1.0.0 — Evidence Capture Guide

This document describes how to collect real evidence from the live AWS deployment.

The goal is to replace placeholders with genuine engineering evidence.

---

# Directory

Create the following directory:

`screenshots/`

Recommended structure:

```
screenshots/
    architecture/
    cloudwatch/
    xray/
    step-functions/
    dynamodb/
    eventbridge/
    api/
    waf/
```

---

# 1. CloudWatch Dashboard

Open:
- CloudWatch → Dashboards → `hermes-dev-observability-dashboard`

Capture:
- full dashboard
- API requests
- API latency
- Step Functions metrics
- Custom Hermes metrics

Save as:
`screenshots/cloudwatch/dashboard.png`

---

# 2. X-Ray Trace

Open:
- AWS X-Ray → Traces

Trigger:
- `POST /assets`

Open the complete trace.

Capture:
- service map
- timeline
- trace details

Save as:
- `screenshots/xray/service-map.png`
- `screenshots/xray/trace-timeline.png`

---

# 3. Step Functions

Open:
- AWS Step Functions

Select:
- `document-pipeline-v1`

Run one execution.

Capture:
- Execution Graph
- Execution History
- Successful execution

Save as:
- `screenshots/step-functions/execution-graph.png`
- `screenshots/step-functions/execution-history.png`

---

# 4. EventBridge

Open:
- Amazon EventBridge

Capture:
- Event Bus
- Rules
- Targets

Save as:
- `screenshots/eventbridge/event-bus.png`
- `screenshots/eventbridge/rules.png`

---

# 5. DynamoDB

Capture:
- Event Store table
- Execution Read Model
- Workflow Read Model
- Usage Read Model
- Audit Read Model

Save as:
- `screenshots/dynamodb/event-store.png`
- `screenshots/dynamodb/read-model.png`

---

# 6. API Gateway

Capture:
- Routes
- Authorizer
- Stages

Save as:
- `screenshots/api/routes.png`
- `screenshots/api/jwt-authorizer.png`

---

# 7. WAF

Capture:
- Web ACL
- Rules
- Rate Limit Rule
- Managed Rule Set

Save as:
- `screenshots/waf/web-acl.png`

---

# 8. Cognito

Capture:
- User Pool
- Groups
- App Client
- JWT configuration

Save as:
- `screenshots/api/cognito-user-pool.png`

---

# 9. Smoke Test

Run:
- `./scripts/smoke-test.sh`

Capture:
- Successful output

Save as:
- `screenshots/api/smoke-test.png`

---

# 10. Unit Tests

Run:
- `npm test`

Capture:
- 39 / 39 passing

Save as:
- `screenshots/api/unit-tests.png`

---

# 11. Terraform

Run:
- `terraform plan`

Capture:
- No changes.

Save as:
- `screenshots/api/terraform-plan.png`

---

# 12. GitHub Actions

Capture:
- Successful CI
- Successful Tests
- Successful Terraform Validation

Save as:
- `screenshots/api/github-actions.png`

---

# README Usage

Reference screenshots where appropriate.

For example:

```markdown
## CloudWatch Dashboard
![CloudWatch Dashboard](screenshots/cloudwatch/dashboard.png)

## X-Ray Trace
![X-Ray](screenshots/xray/service-map.png)

## Step Functions
![Execution Graph](screenshots/step-functions/execution-graph.png)
```

---

# Important

Only use screenshots captured from the actual AWS deployment.

Do not edit screenshots except for:
- blurring account IDs
- blurring emails
- blurring usernames
- blurring secrets

Do not modify metrics or timestamps.

These screenshots are intended as supporting engineering evidence.
