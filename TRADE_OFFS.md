# Hermes — Component Trade-Offs Matrix

A senior engineering candidate must demonstrate deep awareness of the trade-offs inherent in every technical decision. This document details the advantages and limitations of each major component in Hermes.

---

## 1. Amazon EventBridge

| Aspect | Evaluation |
|---|---|
| **Pros** | Serverless native event bus, content-based rule filtering, zero cluster management, native direct target integration with Step Functions and SQS. |
| **Cons** | AWS vendor lock-in, 256 KB maximum payload size limit, non-guaranteed global total ordering across distinct rules, pay-per-event cost at extreme scale (>1B events/mo). |

---

## 2. AWS Step Functions

| Aspect | Evaluation |
|---|---|
| **Pros** | Declarative state machine orchestration, built-in retry and exponential backoff policies, visual workflow graph in console, native IAM security. |
| **Cons** | State transition cost ($0.025 per 1,000 state transitions), JSONPath payload transformation syntax complexity, vendor lock-in compared to open-source alternatives (Temporal/Airflow). |

---

## 3. Amazon DynamoDB (Single-Table Event Store)

| Aspect | Evaluation |
|---|---|
| **Pros** | Unlimited horizontal scaling, zero connection pool exhaustion under Lambda bursts, $O(1)$ key lookups, native CDC via DynamoDB Streams, 99.999% availability. |
| **Cons** | 400 KB item size limit, 4 MB transaction request size limit (`TransactWriteItems`), complex GSI modeling requirements, vendor lock-in. |

---

## 4. Transactional Outbox Pattern (DynamoDB Streams → SQS → Lambda)

| Aspect | Evaluation |
|---|---|
| **Pros** | Eliminates dual-write data loss risk, guarantees at-least-once delivery, decouples API ingestion from downstream event broker availability. |
| **Cons** | Asynchronous event delivery latency (~50ms delay), event consumers must implement idempotency guards to handle potential duplicate messages. |

---

## 5. CQRS Architecture

| Aspect | Evaluation |
|---|---|
| **Pros** | Completely isolates write workload (event store) from read queries, enables independent scaling, supports fast specialized read models and full-text search. |
| **Cons** | Eventual consistency window between event publication and read model projection update (typically < 200ms), increased operational codebase complexity. |

---

## 6. AWS WAFv2 & Cognito Auth

| Aspect | Evaluation |
|---|---|
| **Pros** | Edge-level DDoS rate limiting, managed vulnerability rulesets, zero application code overhead for signature verification, standardized OAuth2/JWT claims. |
| **Cons** | Additional per-request latency overhead (~5–10ms), cost per Web ACL rule, testing setup complexity for automated CI scripts requiring mock claim headers. |

---

## 7. Zero-Dependency Node.js Native Test Runner (`node --test`)

| Aspect | Evaluation |
|---|---|
| **Pros** | Zero external test framework dependencies, lightning-fast execution speed (< 1.2s for full suite), native ESM and TypeScript support via `tsx`. |
| **Cons** | Requires Node.js >= 20.0, fewer third-party ecosystem plugins compared to mature frameworks like Jest or Vitest. |
