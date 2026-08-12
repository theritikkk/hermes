import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './handler';
import { ActivityInput } from '@hermes/activity-runner';

describe('classify worker', () => {
  const baseInput: ActivityInput = { executionId: 'ex1', stepName: 'classify', s3Key: 'file.pdf' };

  test('Text containing invoice -> classification invoice', async () => {
    const res = await classify({ ...baseInput, priorOutput: { extractedText: 'this is an invoice' } });
    assert.equal(res.classification, 'invoice');
  });

  test('Text without invoice -> classification general', async () => {
    const res = await classify({ ...baseInput, priorOutput: { extractedText: 'random text here' } });
    assert.equal(res.classification, 'general');
  });

  test('Empty/undefined extractedText -> general', async () => {
    const res = await classify(baseInput);
    assert.equal(res.classification, 'general');
  });

  test('Always returns confidence 0.85', async () => {
    const res = await classify(baseInput);
    assert.equal(res.confidence, 0.85);
  });

  test('Always returns classifier stub-v1', async () => {
    const res = await classify(baseInput);
    assert.equal(res.classifier, 'stub-v1');
  });

  test('Returns s3Key in output', async () => {
    const res = await classify(baseInput);
    assert.equal(res.s3Key, 'file.pdf');
  });
});
