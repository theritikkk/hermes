import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCreateSnapshot, loadSnapshotAndReplay, AggregateSnapshot } from './snapshot';
import { EventEnvelope } from '@hermes/domain';

interface State {
  count: number;
}

const reducer = (state: State, _event: EventEnvelope) => ({ count: state.count + 1 });

describe('Aggregate Snapshotting Engine', () => {
  describe('shouldCreateSnapshot', () => {
    test('returns true for multiples of threshold (50, 100)', () => {
      assert.equal(shouldCreateSnapshot(50, 50), true);
      assert.equal(shouldCreateSnapshot(100, 50), true);
    });

    test('returns false for non-multiples (0, 1, 49, 51)', () => {
      assert.equal(shouldCreateSnapshot(0, 50), false);
      assert.equal(shouldCreateSnapshot(1, 50), false);
      assert.equal(shouldCreateSnapshot(49, 50), false);
      assert.equal(shouldCreateSnapshot(51, 50), false);
    });

    test('respects custom threshold', () => {
      assert.equal(shouldCreateSnapshot(10, 10), true);
      assert.equal(shouldCreateSnapshot(20, 10), true);
      assert.equal(shouldCreateSnapshot(5, 10), false);
      assert.equal(shouldCreateSnapshot(15, 10), false);
    });
    
    test('default threshold is 50', () => {
      assert.equal(shouldCreateSnapshot(50), true);
      assert.equal(shouldCreateSnapshot(100), true);
      assert.equal(shouldCreateSnapshot(49), false);
    });
  });

  describe('loadSnapshotAndReplay', () => {
    const aggregateId = 'exec-snapshot';
    const events: EventEnvelope[] = Array.from({ length: 100 }, (_, i) => ({
      eventId: `evt-${i + 1}`,
      eventType: 'StepCompleted',
      eventVersion: 1,
      aggregateType: 'WorkflowExecution',
      aggregateId,
      tenantId: 'tenant-dev',
      correlationId: aggregateId,
      occurredAt: new Date().toISOString(),
      sequence: i + 1,
      payload: { value: 1 },
    }));

    test('folds ONLY events after snapshot sequence', () => {
      const snapshot: AggregateSnapshot<State> = {
        aggregateId,
        sequence: 50,
        state: { count: 50 },
        createdAt: '2026-08-11T12:00:00.000Z',
      };

      const result = loadSnapshotAndReplay(snapshot, events, { count: 0 }, reducer);
      
      assert.equal(result.eventsFolded, 50);
      assert.equal(result.finalState.count, 100); 
    });

    test('correctly starts state from snapshot state', () => {
      const snapshot: AggregateSnapshot<State> = {
        aggregateId,
        sequence: 90,
        state: { count: 90 },
        createdAt: new Date().toISOString(),
      };

      const result = loadSnapshotAndReplay(snapshot, events, { count: 0 }, reducer);
      
      assert.equal(result.eventsFolded, 10);
      assert.equal(result.finalState.count, 100);
    });

    test('handles null snapshot by starting from initial state', () => {
      const result = loadSnapshotAndReplay(null, events, { count: 0 }, reducer);
      
      assert.equal(result.eventsFolded, 100);
      assert.equal(result.finalState.count, 100);
    });
    
    test('handles no events to apply after snapshot', () => {
      const snapshot: AggregateSnapshot<State> = {
        aggregateId,
        sequence: 100,
        state: { count: 100 },
        createdAt: new Date().toISOString(),
      };

      const result = loadSnapshotAndReplay(snapshot, events, { count: 0 }, reducer);
      
      assert.equal(result.eventsFolded, 0);
      assert.equal(result.finalState.count, 100);
    });
    
    test('handles empty events array with null snapshot', () => {
      const result = loadSnapshotAndReplay(null, [], { count: 0 }, reducer);
      
      assert.equal(result.eventsFolded, 0);
      assert.deepEqual(result.finalState, { count: 0 });
    });
    
    test('handles empty events array with snapshot', () => {
      const snapshot: AggregateSnapshot<State> = {
        aggregateId,
        sequence: 3,
        state: { count: 3 },
        createdAt: new Date().toISOString(),
      };

      const result = loadSnapshotAndReplay(snapshot, [], { count: 0 }, reducer);
      
      assert.equal(result.eventsFolded, 0);
      assert.deepEqual(result.finalState, snapshot.state);
    });
  });
});
