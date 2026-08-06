# ADR-010: Platform Scope, Not Vertical Document Processor

## Status

Accepted

## Context

v1 read as a "document OCR pipeline with extra steps." That limits reuse, overfits storage/search into the core story, and positions Hermes as a feature list rather than a platform.

## Decision

Hermes is a **workflow orchestration platform**:

- Core concepts: `WorkflowDefinition`, `WorkflowExecution`, `Activity`, `Event`, `Projection`.
- **document-pipeline** is one **built-in template** in `workflows/templates/`.
- Additional templates (`approval-flow`, `batch-etl`) share the same engine, event store, and projection machinery.
- Activities register by name; templates reference activities declaratively.

Document-specific stores (OpenSearch index shape) are projection concerns for that template, not platform core.

## Consequences

**Positive**

- Implementation forces clean boundaries (engine vs template vs activity).
- Portfolio/interview story is stronger: "I built Temporal-like semantics on AWS," not "I chained OCR Lambdas."
- New verticals add template + activities, not fork the platform.

**Negative**

- Slightly more abstraction in Phase 1 (generic execution model).
- Risk of over-abstraction — mitigated by shipping one real template end-to-end first.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Document-only product | Doesn't match long-term goal; wastes replay/CQRS generality |
| Full BPMN engine | Over-engineered for v1; ASL + templates sufficient |
