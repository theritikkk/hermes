# ADR-022: ECS Fargate for Java APIs

## Status

**Superseded**  Reverted during Phase 1 remediation (August 2026)

## Original Decision

Deploy Java API services (`command-api`, `query-api`, `replay-service`, `admin-service`) using **ECS Fargate** to avoid JVM cold-start latency.

## Why This Was Reverted

1. **Contradicts the project's core serverless constraint.** The original project brief mandates: "DO NOT USE ECS / EKS / Kubernetes / long-running EC2 servers  everything should be designed around serverless services." This ADR was adopted without flagging that contradiction.

2. **The premise (Java runtime) was itself reversed.** ADR-013 established Node.js/TypeScript as the Lambda runtime for Phase 1 services. With TypeScript handlers, JVM cold-start latency is not a concern, and the ECS Fargate workaround becomes unnecessary.

3. **Scope creep.** `replay-service` and `admin-service` are Phase 2+ scope. Deploying them on ECS in Phase 1 expanded both the runtime footprint and operational surface area without justification.

## What Changed

- Java implementations of `command-api` and `query-api` were removed (TypeScript handlers per ADR-013).
- The `ecs-fargate-service` Terraform module was removed from `infra/modules/`.
- `replay-service` and `admin-service` were moved out of the active Phase 1 build path.

## References

- ADR-013: Node.js/TypeScript Lambda Runtime
- ADR-011: Removed Components
- Original project constraint: serverless-only architecture
