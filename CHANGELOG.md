# Changelog & Release Notes

All notable changes to Hermes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0] - 2026-08-11 — Initial Production-Inspired Release

### Summary
Initial release of Hermes: a production-inspired serverless workflow orchestration platform on AWS demonstrating Event Sourcing, CQRS, Transactional Outbox pattern, Step Functions state machine orchestration, distributed observability, multitenant security, and Infrastructure-as-Code.

### Added
- **Core Platform (`@hermes/domain`, `@hermes/event-store`, `@hermes/command-handlers`)**:
  - Append-only event store on DynamoDB with 12 domain event types.
  - Transactional Outbox pattern using DynamoDB Streams, SQS buffer, and `outbox-publisher` Lambda.
  - Step Functions process manager integration (`document-pipeline-v1`, `document-pipeline-v2`, `approval-flow-v1`, `batch-etl-v1`).
  - Aggregate snapshotting mechanism (`snapshot-trigger`).
  - Stale outbox republisher (`outbox-republisher`) and poison message handler (`dlq-handler`).

- **CQRS Read Models & Query API**:
  - 6 dedicated DynamoDB read model tables (`execution`, `workflow`, `asset`, `tenant`, `metrics`, `audit`).
  - OpenSearch bulk indexer (`opensearch-projection`) with monthly index rotation.
  - Query API handler (`query-api`) for fast $O(1)$ lookups.

- **Authentication, Tenant Isolation & RBAC**:
  - Amazon Cognito User Pool integration with JWT authorizer.
  - Role-Based Access Control (`Admin`, `User`, `Service` roles).
  - Strict tenant boundary isolation enforcer (`TenantIsolationError`).

- **Observability & Security Hardening**:
  - AWS X-Ray active distributed tracing across 13 Lambda functions.
  - CloudWatch Embedded Metric Format (EMF) operational metrics.
  - CloudWatch Observability Dashboard (`hermes-dev-observability-dashboard`).
  - AWS WAFv2 Web ACL (`RateLimitPerIP` + AWS Managed Common Ruleset).
  - S3 Public Access Blocks & Glacier Lifecycle transitions.
  - KMS Customer Managed Key automatic rotation (`enable_key_rotation = true`).

- **Developer Experience & Tooling**:
  - Zero-dependency Node.js native test runner test suite (21 unit tests).
  - GitHub Actions CI workflow (`.github/workflows/ci.yml`).
  - Interactive CLI tool (`scripts/dev.sh`).
  - Automated 8-layer critical path smoke test script (`scripts/smoke-test.sh`).
