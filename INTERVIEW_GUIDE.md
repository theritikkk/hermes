# Hermes — Technical Interview Guide & Architectural Defense

This guide equips you to defend every architectural choice in Hermes during technical interviews, system design interviews, and engineering discussions.

---

## ⏱️ Elevator Pitches

### 30-Second Pitch (Elevator / Quick Introduction)
> "Hermes is a production-inspired serverless workflow orchestration platform built on AWS. It handles multi-step processes like document pipelines and ETL jobs using Event Sourcing, CQRS, and the Transactional Outbox pattern. By combining DynamoDB, EventBridge, and Step Functions, it guarantees at-least-once event delivery with zero dual-write data loss and low-latency O(1) read queries from pre-projected CQRS read models."

### 2-Minute Pitch (Recruiter / Hiring Manager)
> "In event-driven serverless architectures, a common flaw is dual-write vulnerability—writing state to a database and inline publishing to an event bus can cause data loss if either step fails. Hermes solves this by implementing the Transactional Outbox pattern: commands append events to a single-table DynamoDB event store atomically. An SQS stream consumer then reliably publishes them to EventBridge.
>
> On the read side, Hermes uses CQRS: queries read exclusively from lightweight DynamoDB read models updated by asynchronous event projections, completely isolating query load from event store writes. The platform features Cognito JWT authentication, tenant boundary security, AWS X-Ray distributed tracing, CloudWatch EMF metrics, WAFv2 rate-limiting, and 100% automated CI/CD validation."

### 10-Minute Technical Overview (Senior Technical Interviewer)
> *(Use the walkthrough structure in [`DEMO.md`](DEMO.md) tracing API Gateway → Command API → DynamoDB Event Store → SQS Outbox → EventBridge → Step Functions → Workers → CQRS Projections → Query API).*

### 30-Minute Deep-Dive (System Design Interview)
> *(Cover architectural trade-offs, failure modes, disaster recovery, idempotency key design, sequence guards, and load test SLA profiles in [`BENCHMARKS.md`](BENCHMARKS.md) and [`TRADE_OFFS.md`](TRADE_OFFS.md)).*

---

## ❓ Technical Q&A & Architectural Defense

### 1. Why EventBridge instead of Amazon SNS or SQS?
- **Answer**: EventBridge provides native content-based event filtering (`detail-type`, `source`, `payload`), native target rules directly invoking AWS Step Functions state machines without Lambda glue code, and a schema registry. SNS requires separate SQS subscriptions per consumer without native Step Functions parameter transformation.

### 2. Why AWS Step Functions instead of Temporal or Airflow?
- **Answer**: Step Functions is a fully managed AWS serverless primitive with zero cluster management overhead, visual state tracking, built-in retry/backoff policies, and native IAM integration. Airflow and Temporal require running persistent server clusters, which introduces operational infrastructure management overhead for serverless Lambda workloads.

### 3. Why CQRS (Command Query Responsibility Segregation)?
- **Answer**: Write models (append-only event store) and read models (dashboard queries, execution lookups) have completely opposing performance profiles. CQRS allows writes to be append-only $O(1)$ operations with zero indexes, while read models are projected into query-optimized DynamoDB single-table keys (`TENANT#<id>`, `EXEC#<id>`) and OpenSearch for full-text search.

### 4. Why DynamoDB as the Event Store instead of PostgreSQL or Kafka?
- **Answer**: DynamoDB handles serverless Lambda bursts without connection pool exhaustion (`MaxConnectionsExceeded`). Its `TransactWriteItems` API enables atomic writes across meta items and event items, while DynamoDB Streams provides an immutable CDC log powering the Transactional Outbox.

### 5. Why OpenSearch?
- **Answer**: OpenSearch handles full-text search over unstructured worker outputs (OCR text, document metadata, classification confidence scores) and time-series analytical aggregations across monthly rotated indexes (`hermes-executions-YYYY.MM`) that relational or key-value stores cannot serve efficiently.

### 6. Why the Transactional Outbox Pattern?
- **Answer**: Dual writes are a fundamental flaw in distributed systems. If an inline `EventBridge.putEvents()` call fails after a database write, an event is silently lost. Writing the outbox event into DynamoDB within the same database transaction guarantees that if the aggregate update persists, the outbox event is guaranteed to exist.

### 7. Why Aggregate Snapshots?
- **Answer**: Replaying 10,000 historical events to reconstruct an aggregate's current state is slow and costly. `snapshot-trigger` monitors aggregate sequence numbers; once sequence crosses threshold $N=50$, it writes a snapshot item (`SNAP#<seq>`). Replay loads the latest snapshot and folds only subsequent events ($N > 50$).

### 8. Why Amazon Cognito?
- **Answer**: Cognito handles user identity management, password flows, custom tenant claims (`custom:tenantId`), and OAuth2 / JWT issuance natively. API Gateway validates JWT signatures at the edge before invoking Lambda functions.

### 9. Why AWS WAFv2?
- **Answer**: Protects API Gateway endpoints against DDoS floods and malicious bots. Enforces rate limits (1,000 requests per 5 minutes per IP) and applies AWS Managed Rules for SQL injection and cross-site scripting prevention.

### 10. Why Customer Managed Keys (KMS CMK)?
- **Answer**: Enterprise regulatory compliance requires customer-controlled encryption key policies, annual key rotation (`enable_key_rotation = true`), and explicit IAM separation between key administration and data access.
