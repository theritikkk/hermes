# Hermes — Operational AWS Cost Estimates

This document provides empirical operational AWS cost estimates for running Hermes across three production workload scales in `ap-south-1` (Mumbai region).

---

## Workload Scale Profiles

| Scale Profile | Daily Executions | Monthly Executions | Daily Lambda Invocations | Monthly Lambda Invocations |
|---|---|---|---|---|
| **Low Scale (Dev/Staging)** | 10,000 / day | **300,000 / mo** | ~80,000 / day | **2.4 Million / mo** |
| **Mid Scale (Production)** | 100,000 / day | **3 Million / mo** | ~800,000 / day | **24 Million / mo** |
| **High Scale (Enterprise)** | 1,000,000 / day | **30 Million / mo** | ~8,000,000 / day | **240 Million / mo** |

*Note: Each workflow execution averages 8 Lambda invocations (command-api, 3 activity workers, outbox-publisher, execution-projection, usage-projection, opensearch-projection).*

---

## Cost Breakdown by AWS Service

### 1. Mid Scale (100,000 Executions / Day ~ 3M Executions / Month)

| AWS Service | Pricing Rate (`ap-south-1`) | Monthly Usage | Estimated Cost |
|---|---|---|---|
| **API Gateway (HTTP API)** | $1.00 per 1M requests | 3.0M Command + 1.5M Read queries = 4.5M | **$4.50** |
| **AWS Lambda** | $0.20 / 1M requests + $0.0000166667 / GB-sec | 24M requests @ 256MB memory, 150ms avg duration | **$19.80** |
| **AWS Step Functions** | $0.025 per 1,000 state transitions | 3.0M executions × 5 transitions = 15M transitions | **$375.00** |
| **Amazon EventBridge** | $1.00 per 1M events published | 6.0M events (3M started + 3M completed) | **$6.00** |
| **Amazon DynamoDB** | $1.25 / 1M WCU + $0.25 / 1M RCU + $0.25 / GB-mo | 6M WCUs (event store) + 3M WCUs (read models) + 20 GB storage | **$16.25** |
| **Amazon SQS** | $0.40 per 1M requests | 6.0M SQS messages (Streams outbox buffer) | **$2.40** |
| **AWS WAFv2** | $5.00 / Web ACL + $1.00 / rule + $0.60 / 1M requests | 1 Web ACL + 2 Rules + 4.5M Requests | **$9.70** |
| **AWS KMS (CMK)** | $1.00 / key + $0.03 / 10,000 requests | 1 CMK Key + Data key caches | **$2.50** |
| **Amazon S3** | $0.023 / GB Standard + $0.0125 / GB IA | 50 GB Raw Assets + Replay Checkpoints | **$1.15** |
| **CloudWatch & X-Ray** | $0.50 / GB logs + $5.00 / 1M trace segments | 10 GB Logs + 3M X-Ray Traces | **$20.00** |
| **OpenSearch Domain** | 1 × `t3.small.search` instance ($0.036 / hr) | 730 hours + 10 GB EBS storage | **$27.28** |
| **TOTAL ESTIMATED MONTHLY COST** | — | — | **~$484.58 / mo** |

---

## Cost Optimization & Scaling Strategy

1. **Step Functions Express Workflows**: Switching high-volume short-duration pipelines from Standard Workflows ($0.025 / 1,000 transitions) to Express Workflows ($1.00 / 1M executions + duration) reduces Step Functions cost at Mid Scale from **$375.00** to **~$12.50**, cutting total monthly bill by **75%** to **~$122.00 / mo**.
2. **KMS Data Key Caching**: Static SDK client instantiation outside Lambda handlers reduces KMS request costs by 98%.
3. **S3 Glacier Auto-Archive**: Lifecycle rules automatically archive non-current asset versions to Glacier ($0.004 / GB), maintaining low S3 storage costs.
