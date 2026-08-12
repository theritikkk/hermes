import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayAggregate } from './index';
import { EventEnvelope } from '@hermes/domain';

interface SimpleState {
  sequence: number;
  count: number;
}

function applyEvent(state: SimpleState, event: EventEnvelope): SimpleState {
  if (event.sequence <= state.sequence) {
    throw new Error(`Invalid sequence: ${event.sequence} <= ${state.sequence}`);
  }
  return {
    sequence: event.sequence,
    count: state.count + 1,
  };
}

describe('ReplayAggregate Properties', () => {
  test('determinism across 200 randomized valid event sequences', () => {
    for (let i = 0; i < 200; i++) {
      const numEvents = Math.floor(Math.random() * 20) + 1;
      const events: EventEnvelope[] = Array.from({ length: numEvents }, (_, idx) => ({
        eventId: `evt-${idx}`,
        eventType: 'TestEvent' as any,
        eventVersion: 1,
        aggregateType: 'TestAggregate' as any,
        aggregateId: `agg-${i}`,
        tenantId: 'tenant-1',
        correlationId: `corr-${i}`,
        occurredAt: new Date().toISOString(),
        sequence: idx + 1,
        payload: {},
      }));

      const initialState: SimpleState = { sequence: 0, count: 0 };
      const result1 = replayAggregate(events, initialState, applyEvent);
      const result2 = replayAggregate(events, initialState, applyEvent);
      
      assert.deepEqual(result1, result2);
      assert.equal(result1.count, numEvents);
      assert.equal(result1.sequence, numEvents);
    }
  });

  test('order sensitivity: shuffled sequence throws error due to invariant violation', () => {
    const events: EventEnvelope[] = Array.from({ length: 10 }, (_, idx) => ({
      eventId: `evt-${idx}`,
      eventType: 'TestEvent' as any,
      eventVersion: 1,
      aggregateType: 'TestAggregate' as any,
      aggregateId: 'agg-1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      occurredAt: new Date().toISOString(),
      sequence: idx + 1,
      payload: {},
    }));

    // Swap first two events to break sequence ordering
    const shuffled = [...events];
    const temp = shuffled[0];
    shuffled[0] = shuffled[1];
    shuffled[1] = temp;

    const initialState: SimpleState = { sequence: 0, count: 0 };
    
    assert.throws(
      () => replayAggregate(shuffled, initialState, applyEvent),
      /Invalid sequence: 1 <= 2/
    );
  });

  test('empty events returns initial state', () => {
    const initialState: SimpleState = { sequence: 0, count: 0 };
    const result = replayAggregate([], initialState, applyEvent);
    assert.deepEqual(result, initialState);
  });

  test('single event applies correctly', () => {
    const initialState: SimpleState = { sequence: 0, count: 0 };
    const event: EventEnvelope = {
      eventId: 'evt-1',
      eventType: 'TestEvent' as any,
      eventVersion: 1,
      aggregateType: 'TestAggregate' as any,
      aggregateId: 'agg-1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      occurredAt: new Date().toISOString(),
      sequence: 1,
      payload: {},
    };
    const result = replayAggregate([event], initialState, applyEvent);
    assert.deepEqual(result, { sequence: 1, count: 1 });
  });

  test('multiple events apply in order', () => {
    const initialState: SimpleState = { sequence: 0, count: 0 };
    const events: EventEnvelope[] = [
      {
        eventId: 'evt-1',
        eventType: 'TestEvent' as any,
        eventVersion: 1,
        aggregateType: 'TestAggregate' as any,
        aggregateId: 'agg-1',
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
        occurredAt: new Date().toISOString(),
        sequence: 1,
        payload: {},
      },
      {
        eventId: 'evt-2',
        eventType: 'TestEvent' as any,
        eventVersion: 1,
        aggregateType: 'TestAggregate' as any,
        aggregateId: 'agg-1',
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
        occurredAt: new Date().toISOString(),
        sequence: 2,
        payload: {},
      }
    ];
    const result = replayAggregate(events, initialState, applyEvent);
    assert.deepEqual(result, { sequence: 2, count: 2 });
  });
});
