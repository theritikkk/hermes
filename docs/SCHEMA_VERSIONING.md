# Hermes — Event Schema Versioning & Upcasting Strategy

This document details the event schema evolution and upcasting strategy for Hermes.

---

## 1. Schema Evolution Principles

Domain events are immutable facts persisted in the event store (`hermes-dev-event-store`). When business requirements require schema updates:
1. **Never mutate old events in place**: Historical events retain their original schema and `eventVersion`.
2. **Backward Compatibility**: New fields are optional or assigned default values via upcaster functions.
3. **Upcasting at Replay Time**: Projections and aggregate reducers pass events through a pure upcaster function before applying state transitions.

---

## 2. Code Example: Upcasting `WorkflowExecutionStarted` (v1 → v2)

### Schema Comparison

```typescript
// Event Schema v1
export interface WorkflowExecutionStartedPayloadV1 {
  executionId: string;
  workflowName: string;
  workflowVersion: number;
  assetId: string;
  s3Key: string;
}

// Event Schema v2 (Adds metadata tag map and priority level)
export interface WorkflowExecutionStartedPayloadV2 {
  executionId: string;
  workflowName: string;
  workflowVersion: number;
  assetId: string;
  s3Key: string;
  tags: Record<string, string>; // New field in v2
  priority: 'HIGH' | 'NORMAL' | 'LOW'; // New field in v2
}
```

### Upcaster Implementation

```typescript
export function upcastEvent(event: EventEnvelope): EventEnvelope {
  // Upcast WorkflowExecutionStarted from v1 to v2
  if (event.eventType === 'WorkflowExecutionStarted' && event.eventVersion === 1) {
    const v1Payload = event.payload as WorkflowExecutionStartedPayloadV1;
    const v2Payload: WorkflowExecutionStartedPayloadV2 = {
      ...v1Payload,
      tags: {},
      priority: 'NORMAL', // Default migration value
    };

    return {
      ...event,
      eventVersion: 2,
      payload: v2Payload,
    };
  }

  return event;
}
```

---

## 3. Migration Strategy Matrix

| Change Type | Migration Strategy | Action Required |
|---|---|---|
| **Add Optional Field** | Transparent Upcaster | Upcaster injects default value at replay time. Zero downtime. |
| **Rename Field** | Aliased Upcaster | Upcaster copies old field name value to new field name. Zero downtime. |
| **Remove Field** | Deprecation Soft Delete | Upcaster ignores missing field or assigns default fallback. Zero downtime. |
| **Breaking Structural Change** | New Event Type (`v2`) | Emit new event type (`WorkflowExecutionStartedV2`); retain handler for `v1`. |
