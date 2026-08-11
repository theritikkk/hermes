import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCreateSnapshot, loadSnapshotAndReplay, AggregateSnapshot } from './snapshot';
import { EventEnvelope } from '@hermes/domain';

interface State {
  count: number;
}

describe('Aggregate Snapshotting Engine', () => {
  test('shouldCreateSnapshot evaluates threshold correctly (every 50 events)', () => {
    assert.equal(shouldCreateSnapshot(49, 50), false);
    assert.equal(shouldCreateSnapshot(50, 50), true);
    assert.equal(shouldCreateSnapshot(100, 50), true);
    assert.equal(shouldCreateSnapshot(101, 50), false);
  });

  test('loadSnapshotAndReplay folds ONLY events after snapshot sequence (1,000 total events, snapshot at 500)', () => {
    const aggregateId = 'exec-snapshot-1000';

    // 1. Generate 1,000 historical events
    const events: EventEnvelope[] = Array.from({ length: 1000 }, (_, i) => ({
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

    // 2. Mock a Snapshot saved at sequence 500
    const snapshot: AggregateSnapshot<State> = {
      aggregateId,
      sequence: 500,
      state: { count: 500 },
      createdAt: '2026-08-11T12:00:00.000Z',
    };

    const reducer = (state: State, _event: EventEnvelope) => ({ count: state.count + 1 });

    // 3. Replay with Snapshot
    const result = loadSnapshotAndReplay(snapshot, events, { count: 0 }, reducer);

    // 4. Assert final state is 1,000 and ONLY 500 events (501 to 1000) were folded!
    assert.equal(result.finalState.count, 1000);
    assert.equal(result.eventsFolded, 500);
  });
});
