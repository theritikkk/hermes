import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePk, eventSk, idempotencyKey } from './index';

describe('domain keys', () => {
  it('builds aggregate partition key', () => {
    assert.equal(aggregatePk('WorkflowExecution', 'exec-1'), 'AGG#WorkflowExecution#exec-1');
  });

  it('builds sort key with zero-padded sequence', () => {
    assert.equal(eventSk(3, 'evt-abc'), 'EVT#0000000003#evt-abc');
  });

  it('builds idempotency key', () => {
    assert.equal(idempotencyKey('exec-1', 'ocr'), 'exec-1#ocr');
  });
});
