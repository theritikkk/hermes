# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for Hermes.

An ADR documents a significant architectural decision: the context that motivated it, the decision made, and its consequences. They are written for engineers who need to understand *why* the system is shaped the way it is — not just *what* it does.

Each ADR follows the format: **Status → Context → Decision → Consequences → Alternatives Considered**.

---

## Index

| # | Decision | Status |
|---|---------|--------|
| [001](001-event-sourcing-for-execution-state.md) | Event sourcing for execution state | Accepted |
| [002](002-cqrs-command-query-separation.md) | CQRS: separate command and query models | Accepted |
| [003](003-dynamodb-event-store.md) | DynamoDB as the event store | Accepted |
| [004](004-postgres-for-configuration.md) | PostgreSQL for relational configuration data | Accepted |
| [005](005-opensearch-as-derived-index.md) | OpenSearch as a derived search index | Accepted |
| [006](006-step-functions-as-process-manager.md) | Step Functions as the process manager | Accepted |
| [007](007-eventbridge-integration-backbone.md) | EventBridge as the integration backbone | Accepted |
| [008](008-idempotency-at-activity-boundary.md) | Idempotency enforced at the activity boundary | Accepted |
| [009](009-workflow-definition-versioning.md) | Immutable workflow definition versioning | Accepted |
| [010](010-platform-not-vertical.md) | Platform scope: not a vertical document processor | Accepted |
| [011](011-removed-components.md) | Components removed from the original design | Superseded |
| [012](012-outbox-for-reliable-publish.md) | Transactional outbox for reliable event publish | Accepted |
| [013](013-nodejs-typescript-lambda-runtime.md) | TypeScript for thin Lambda workers | Accepted |
| [014](014-java-spring-for-apis.md) | Java 21 + Spring Boot for API services | Accepted |
| [015](015-transact-write-for-event-append.md) | `TransactWriteItems` for atomic event append | Accepted |
| [016](016-dynamodb-streams-outbox.md) | DynamoDB Streams → SQS → outbox publisher | Accepted |
| [017](017-tenant-isolation-jwt.md) | Tenant isolation enforced via JWT claims | Accepted |
| [022](022-ecs-fargate-for-java-apis.md) | ECS Fargate as the runtime for Java API services | Accepted |
| [023](023-python-ai-workers.md) | Python for AI/ML activity workers | Accepted |

---

## What is not an ADR

Not every technical choice needs an ADR. The following decisions were made without a formal record because the rationale is self-evident or the decision is implementation-level rather than architectural:

- Using `UUID` for entity IDs (standard practice; alternatives have no meaningful tradeoff)
- Using `@RestController` in Spring Boot (framework convention)
- Using `UpdateCommand` from `@aws-sdk/lib-dynamodb` (idiomatic AWS SDK v2 TypeScript)
- Using Logback for structured logging in Java (Spring Boot default; `logback-spring.xml` is the configuration)
- Using `Dockerfile` multi-stage builds (reduces image size; universally recommended)

---

## Decisions that were explicitly rejected

Some technologies were added speculatively and then removed. These are documented inline in their respective modules or in the ADRs above, not as separate ADRs, because the rejection happened during initial implementation rather than as a course correction:

| Technology | Where rejected | Reason |
|-----------|---------------|--------|
| `aws-sdk/sts` | `pom.xml` comment | Not called in Phase 1; ECS task role handles credential chaining |
| `aws-sdk/secretsmanager` | `pom.xml` comment | Config injected via ECS environment variables; no runtime SDK call needed |
| `dynamodb-enhanced` | `pom.xml` comment | Raw `DynamoDbClient` gives precise control over `TransactWriteItems` attribute structure |
| `resilience4j` | `pom.xml` comment | No circuit breaker wired; deferring until DynamoDB throttling is measured in load tests |
| `aws_schemas_registry` | `eventbridge/main.tf` comment | Single producer + two internal consumers; schema governance is a Phase 3 concern |
| Inline `EventPublisher` in command handlers | Handler comments | Creates the exact dual-write anti-pattern the outbox was designed to prevent |
