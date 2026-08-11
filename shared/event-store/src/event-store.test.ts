import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayAggregate } from './index';
import { EventEnvelope } from '@hermes/domain';

describe('replayAggregate Reducer Utility', () => {
  test('returns initial state when event stream is empty', () => {
    const initialState = { count: 0, status: 'INITIAL' };
    const result = replayAggregate([], initialState, (state) => state);
    assert.deepEqual(result, initialState);
  });

  test('sequentially applies reducer function across event history', () => {
    const events: EventEnvelope[] = [
      {
        eventId: 'evt-1',
        eventType: 'ITEM_ADDED',
        eventVersion: 1,
        aggregateType: 'WorkflowExecution',
        aggregateId: 'agg-1',
        tenantId: 'tenant-dev',
        correlationId: 'agg-1',
        occurredAt: '2026-08-11T10:00:00.000Z',
        sequence: 1,
        payload: { amount: 10 },
      },
      {
        eventId: 'evt-2',
        eventType: 'ITEM_ADDED',
        eventVersion: 1,
        aggregateType: 'WorkflowExecution',
        aggregateId: 'agg-1',
        tenantId: 'tenant-dev',
        correlationId: 'agg-1',
        occurredAt: '2026-08-11T10:05:00.000Z',
        sequence: 2,
        payload: { amount: 25 },
      },
    ];

    const initialState = { total: 0, lastSeq: 0 };
    const reducer = (state: typeof initialState, event: EventEnvelope) => {
      const payload = event.payload as { amount: number };
      return {
        total: state.total + payload.amount,
        lastSeq: event.sequence,
      };
    };

    const finalState = replayAggregate(events, initialState, reducer);
    assert.equal(finalState.total, 35);
    assert.equal(finalState.lastSeq, 2);
  });
});
