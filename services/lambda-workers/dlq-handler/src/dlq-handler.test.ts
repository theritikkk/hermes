import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function classifyFailure(receiveCount: number, errorReason?: string): 'POISON' | 'TRANSIENT' {
  if (receiveCount >= 5 || (errorReason && errorReason.includes('Unparseable'))) {
    return 'POISON';
  }
  return 'TRANSIENT';
}

describe('DLQ Poison Message Classifier', () => {
  test('classifies messages with receive count >= 5 as POISON', () => {
    assert.equal(classifyFailure(5), 'POISON');
    assert.equal(classifyFailure(10), 'POISON');
  });

  test('classifies messages with receive count < 5 as TRANSIENT', () => {
    assert.equal(classifyFailure(1), 'TRANSIENT');
    assert.equal(classifyFailure(3), 'TRANSIENT');
  });

  test('classifies unparseable header errors as POISON regardless of receive count', () => {
    assert.equal(classifyFailure(1, 'Unparseable JSON body'), 'POISON');
  });
});
