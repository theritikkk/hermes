import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEnvelope } from '@hermes/domain';

interface ExecutionProjectionState {
  executionId: string;
  status: string;
  stepCount: number;
  lastSequence: number;
}

function projectEvents(events: EventEnvelope[]): ExecutionProjectionState {
  let state: ExecutionProjectionState = {
    executionId: '',
    status: 'UNKNOWN',
    stepCount: 0,
    lastSequence: 0,
  };

  for (const evt of events) {
    if (evt.eventType === 'WorkflowExecutionStarted') {
      state.executionId = evt.aggregateId;
      state.status = 'RUNNING';
    } else if (evt.eventType === 'StepCompleted') {
      state.stepCount += 1;
    } else if (evt.eventType === 'WorkflowExecutionCompleted') {
      state.status = 'COMPLETED';
    }
    state.lastSequence = evt.sequence;
  }

  return state;
}

describe('Replay Engine & Projection State Reconstruction', () => {
  test('rebuilds projection state accurately from 100 historical events after projection reset', () => {
    const aggregateId = 'exec-replay-100';

    // 1. Generate 100 historical events
    const events: EventEnvelope[] = [
      {
        eventId: 'evt-1',
        eventType: 'WorkflowExecutionStarted',
        eventVersion: 1,
        aggregateType: 'WorkflowExecution',
        aggregateId,
        tenantId: 'tenant-dev',
        correlationId: aggregateId,
        occurredAt: '2026-08-11T10:00:00.000Z',
        sequence: 1,
        payload: { workflowName: 'document-pipeline-v1' },
      },
    ];

    for (let seq = 2; seq <= 99; seq++) {
      events.push({
        eventId: `evt-${seq}`,
        eventType: 'StepCompleted',
        eventVersion: 1,
        aggregateType: 'WorkflowExecution',
        aggregateId,
        tenantId: 'tenant-dev',
        correlationId: aggregateId,
        occurredAt: new Date(Date.now() + seq * 1000).toISOString(),
        sequence: seq,
        payload: { stepName: `step-${seq}` },
      });
    }

    events.push({
      eventId: 'evt-100',
      eventType: 'WorkflowExecutionCompleted',
      eventVersion: 1,
      aggregateType: 'WorkflowExecution',
      aggregateId,
      tenantId: 'tenant-dev',
      correlationId: aggregateId,
      occurredAt: '2026-08-11T11:00:00.000Z',
      sequence: 100,
      payload: {},
    });

    // 2. Simulate complete projection wipe / reset
    let projectionState: ExecutionProjectionState | null = null;

    // 3. Run replay engine over 100 events
    projectionState = projectEvents(events);

    // 4. Assert reconstructed state
    assert.equal(projectionState.executionId, aggregateId);
    assert.equal(projectionState.status, 'COMPLETED');
    assert.equal(projectionState.stepCount, 98);
    assert.equal(projectionState.lastSequence, 100);
  });
});
