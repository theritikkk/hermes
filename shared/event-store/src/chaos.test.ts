import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEnvelope } from '@hermes/domain';

interface ProjectionStore {
  processedEventIds: Set<string>;
  lastSequence: number;
  status: string;
}

function processEventWithChaosGuards(store: ProjectionStore, event: EventEnvelope): { processed: boolean; reason?: string } {
  // Chaos Guard 1: Duplicate Event Deduplication
  if (store.processedEventIds.has(event.eventId)) {
    return { processed: false, reason: 'DUPLICATE_EVENT' };
  }

  // Chaos Guard 2: Out-of-Order Event Sequence Guard
  if (event.sequence <= store.lastSequence) {
    return { processed: false, reason: 'OUT_OF_ORDER_SEQUENCE' };
  }

  store.processedEventIds.add(event.eventId);
  store.lastSequence = event.sequence;
  store.status = event.eventType === 'WorkflowExecutionCompleted' ? 'COMPLETED' : 'RUNNING';

  return { processed: true };
}

describe('Chaos & Failure Resilience Verification', () => {
  test('deduplicates duplicate event delivery (Idempotency Guard)', () => {
    const store: ProjectionStore = { processedEventIds: new Set(), lastSequence: 0, status: 'UNKNOWN' };
    const event: EventEnvelope = {
      eventId: 'evt-dup-1',
      eventType: 'WorkflowExecutionStarted',
      eventVersion: 1,
      aggregateType: 'WorkflowExecution',
      aggregateId: 'agg-chaos-1',
      tenantId: 'tenant-chaos',
      correlationId: 'agg-chaos-1',
      occurredAt: new Date().toISOString(),
      sequence: 1,
      payload: {},
    };

    const res1 = processEventWithChaosGuards(store, event);
    const res2 = processEventWithChaosGuards(store, event);

    assert.equal(res1.processed, true);
    assert.equal(res2.processed, false);
    assert.equal(res2.reason, 'DUPLICATE_EVENT');
  });

  test('drops out-of-order event delivery (Sequence Guard)', () => {
    const store: ProjectionStore = { processedEventIds: new Set(['evt-1', 'evt-2']), lastSequence: 5, status: 'RUNNING' };
    const staleEvent: EventEnvelope = {
      eventId: 'evt-stale-3',
      eventType: 'StepCompleted',
      eventVersion: 1,
      aggregateType: 'WorkflowExecution',
      aggregateId: 'agg-chaos-2',
      tenantId: 'tenant-chaos',
      correlationId: 'agg-chaos-2',
      occurredAt: new Date().toISOString(),
      sequence: 3,
      payload: {},
    };

    const res = processEventWithChaosGuards(store, staleEvent);
    assert.equal(res.processed, false);
    assert.equal(res.reason, 'OUT_OF_ORDER_SEQUENCE');
    assert.equal(store.lastSequence, 5);
  });
});
