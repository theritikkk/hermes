# ADR-014: Java/Spring Boot for APIs

## Status

**Superseded** by ADR-013 — Reverted during Phase 1 remediation (August 2026)

## Original Decision

Use Java 21 + Spring Boot 3.2 for `command-api`, `query-api`, `replay-service`, and `admin-service`, deployed on ECS Fargate.

## Why This Was Superseded

ADR-013 established Node.js/TypeScript as the standard runtime for all Phase 1 Lambda services. The Java/Spring Boot implementations duplicated functionality already present in the TypeScript codebase, introduced a second runtime with no Phase 1 justification, and required ECS Fargate (see ADR-022) which violated the project's serverless-only constraint.

The Java implementations of `command-api` and `query-api` have been removed. `replay-service` and `admin-service` (also Java) have been moved to Phase 2+ scope.

## References

- ADR-013: Node.js/TypeScript Lambda Runtime
- ADR-022: ECS Fargate for Java APIs (also superseded)
