# Hermes — Scaling Analysis (10x, 100x, 1000x)

This document analyzes system behavior, bottlenecks, and engineering remedies across three scaling tiers.

---

## Scaling Tier Matrix

| Workload Tier | Executions / Day | Events / Day | Primary Bottleneck | Engineering Remedy |
|---|---|---|---|---|
| **Current Baseline** | 100,000 | 800,000 | None | Baseline DynamoDB On-Demand + Lambda Auto-scaling |
| **10x Scale** | **1,000,000** | **8,000,000** | AWS Lambda Account Concurrency Quota (1,000) | Request AWS Lambda Concurrency Increase to 5,000; switch SQS batch size from 1 to 10. |
| **100x Scale** | **10,000,000** | **80,000,000** | Step Functions Standard Workflow Transition Costs & DynamoDB Hot Partition WCU limit (1,000 WCU/sec) | Switch to Step Functions Express Workflows; Partition Event Store by `AGG#<tenantId>#<date>#<aggregateId>`. |
| **1000x Scale** | **100,000,000** | **800,000,000** | EventBridge Bus Throughput Quota (10,000 events/sec) & OpenSearch Indexing Bottleneck | Shard EventBridge Across Regional Buses; Batch OpenSearch NDJSON Bulk Indexer; Provision Amazon Kinesis Data Streams for CDC. |
