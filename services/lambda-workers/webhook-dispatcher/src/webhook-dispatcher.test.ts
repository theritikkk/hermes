import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

function generateSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Webhook Dispatcher Cryptographic Signatures', () => {
  test('generates valid HMAC-SHA256 signature for payload', () => {
    const payload = JSON.stringify({ id: 'evt-1', type: 'WorkflowExecutionCompleted' });
    const secret = 'my-secret-key';
    const sig1 = generateSignature(payload, secret);
    const sig2 = generateSignature(payload, secret);

    assert.equal(sig1, sig2);
    assert.equal(sig1.length, 64); // 64 hex chars for SHA-256
  });

  test('different secret produces different HMAC signature', () => {
    const payload = JSON.stringify({ id: 'evt-1', type: 'WorkflowExecutionCompleted' });
    const sig1 = generateSignature(payload, 'secret-1');
    const sig2 = generateSignature(payload, 'secret-2');

    assert.notEqual(sig1, sig2);
  });
});
