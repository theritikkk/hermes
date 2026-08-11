import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function shouldProcessEvent(currentSequence: number, incomingSequence: number): boolean {
  return incomingSequence > currentSequence;
}

describe('Execution Projection Optimistic Sequence Guards', () => {
  test('allows in-order events with sequence > current_sequence', () => {
    assert.equal(shouldProcessEvent(1, 2), true);
    assert.equal(shouldProcessEvent(5, 6), true);
  });

  test('rejects out-of-order events with sequence <= current_sequence', () => {
    assert.equal(shouldProcessEvent(2, 1), false);
    assert.equal(shouldProcessEvent(5, 5), false);
  });
});
