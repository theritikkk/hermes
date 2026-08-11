# ADR-013: Node.js/TypeScript Lambda Runtime (not Java/Spring Boot)

## Status

Accepted

## Context

The original project brief specified **Java 21 / Spring Boot** for Lambda handlers. The implemented scaffold uses **Node.js 20 / TypeScript** with thin handlers and shared packages in a npm monorepo.

This is a deliberate deviation, not accidental stack drift. It should be documented so reviewers (and future contributors) understand the trade-off was considered.

## Decision

Use **Node.js 20 + TypeScript** for all Lambda functions in Phase 1:

- Thin command handlers, activity workers, and projection Lambdas
- Shared domain logic in `@hermes/domain`, `@hermes/command-handlers`, `@hermes/event-store`
- No Spring context, no JVM warm-up on cold start

Java/Spring Boot remains a valid choice for Phase 2+ **if** a component needs it (e.g., heavy PDF/OCR libraries with mature JVM ecosystems, or a team mandate). Such components would be isolated container Lambdas behind the same activity interface  not a platform-wide rewrite.

## Consequences

**Positive**

- Faster cold starts for small, I/O-bound handlers (command-api, projections)  typically hundreds of ms vs multi-second JVM
- Smaller deployment packages for thin handlers
- TypeScript aligns with React frontend and JSON-heavy workflow/event payloads
- npm workspaces keep domain, event store, and handlers in one repo with shared types

**Negative**

- Deviates from stated brief  must be explained in README/ADRs
- Weaker ecosystem for some document-processing libraries (OCR)  Phase 2 may use container Lambdas (Java or Python) for specific activities only
- No Spring's DI/validation conventions  we own handler wiring explicitly

## Alternatives Considered

| Alternative | Rejected for Phase 1 because |
|-------------|------------------------------|
| Java 21 / Spring Boot everywhere | JVM cold-start cost on bursty, short Lambda invocations; heavier artifact sizes for thin handlers |
| Python | Viable for OCR activities; platform core chose TS for frontend alignment and shared types |
| Mix from day one | Operational complexity before the pipeline is proven |

## References

- [AWS Lambda cold start comparison](https://docs.aws.amazon.com/lambda/latest/operatorguide/execution-environments.html)  execution environment lifecycle
- ADR-006  Step Functions as process manager (orchestration is AWS-native; runtime choice affects activities only)
