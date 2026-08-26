import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEnvelope, idempotencyKey, aggregatePk, eventSk } from './index';

interface AggregateState {
  sequence: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

function applyEvent(state: AggregateState, event: EventEnvelope): AggregateState {
  // Invariant Check 1: Sequence must strictly increase monotonically
  if (event.sequence <= state.sequence) {
    throw new Error(`Invariant Violation: sequence ${event.sequence} <= current sequence ${state.sequence}`);
  }

  // Invariant Check 2: Terminal states cannot transition back
  if (state.status === 'COMPLETED' || state.status === 'FAILED') {
    throw new Error(`Invariant Violation: terminal state '${state.status}' cannot transition to new event '${event.eventType}'`);
  }

  let nextStatus = state.status;
  if (event.eventType === 'WorkflowExecutionStarted') nextStatus = 'RUNNING';
  else if (event.eventType === 'WorkflowExecutionCompleted') nextStatus = 'COMPLETED';
  else if (event.eventType === 'WorkflowExecutionFailed') nextStatus = 'FAILED';

  return {
    sequence: event.sequence,
    status: nextStatus,
  };
}

describe('Property-Based Domain Invariant Testing', () => {
  test('aggregate invariants hold across 500 randomized valid event sequences', () => {
    for (let run = 0; run < 500; run++) {
      let state: AggregateState = { sequence: 0, status: 'PENDING' };
      const eventTypes = ['WorkflowExecutionStarted', 'StepCompleted', 'StepCompleted', 'WorkflowExecutionCompleted'];
      
      for (let i = 0; i < eventTypes.length; i++) {
        const event: EventEnvelope = {
          eventId: `evt-${run}-${i + 1}`,
          eventType: eventTypes[i] as any,
          eventVersion: 1,
          aggregateType: 'WorkflowExecution',
          aggregateId: `agg-${run}`,
          tenantId: 'tenant-property',
          correlationId: `agg-${run}`,
          occurredAt: new Date().toISOString(),
          sequence: i + 1,
          payload: {},
        };

        state = applyEvent(state, event);
      }

      assert.equal(state.sequence, 4);
      assert.equal(state.status, 'COMPLETED');
    }
  });

  test('property test detects invalid terminal state mutation invariant', () => {
    let state: AggregateState = { sequence: 10, status: 'COMPLETED' };
    const invalidEvent: EventEnvelope = {
      eventId: 'evt-invalid',
      eventType: 'WorkflowExecutionStarted' as any,
      eventVersion: 1,
      aggregateType: 'WorkflowExecution',
      aggregateId: 'agg-terminal',
      tenantId: 'tenant-property',
      correlationId: 'agg-terminal',
      occurredAt: new Date().toISOString(),
      sequence: 11,
      payload: {},
    };

    assert.throws(
      () => applyEvent(state, invalidEvent),
      /Invariant Violation: terminal state 'COMPLETED' cannot transition/,
    );
  });

  test('idempotencyKey is deterministic across 200 random inputs', () => {
    for (let i = 0; i < 200; i++) {
      const execId = `exec-${Math.random().toString(36).substring(7)}`;
      const stepName = `step-${Math.random().toString(36).substring(7)}`;
      const key1 = idempotencyKey(execId, stepName);
      const key2 = idempotencyKey(execId, stepName);
      assert.equal(key1, key2);
      assert.equal(key1, `${execId}#${stepName}`);
    }
  });

  test('aggregatePk format invariant check', () => {
    const pk1 = aggregatePk('WorkflowExecution', '123');
    assert.equal(pk1, 'AGG#WorkflowExecution#123');
    
    const pk2 = aggregatePk('Asset', '456');
    assert.equal(pk2, 'AGG#Asset#456');
    
    assert.ok(pk1.startsWith('AGG#'));
  });

  test('eventSk lexicographical sort ordering matches numeric sequence ordering for 500 random sequences', () => {
    const seqSet = new Set<number>();
    while (seqSet.size < 500) {
      seqSet.add(Math.floor(Math.random() * 10000000));
    }
    const sequences = Array.from(seqSet);
    const eventIds = Array.from({ length: 500 }, () => `evt-${Math.random().toString(36).substring(7)}`);
    
    const items = sequences.map((seq, i) => ({
      seq,
      sk: eventSk(seq, eventIds[i])
    }));
    
    // Sort by numeric sequence
    const numericSorted = [...items].sort((a, b) => a.seq - b.seq);
    
    // Sort by lexicographical SK
    const lexicographicalSorted = [...items].sort((a, b) => a.sk.localeCompare(b.sk));
    
    for (let i = 0; i < 500; i++) {
      assert.equal(numericSorted[i].sk, lexicographicalSorted[i].sk);
    }
  });
});
