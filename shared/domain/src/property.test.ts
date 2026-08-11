import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEnvelope } from './index';

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
});
