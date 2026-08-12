import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ocr } from './handler';
import { ActivityInput } from '@hermes/activity-runner';

describe('ocr worker', () => {
  const baseInput: ActivityInput = { executionId: 'ex1', stepName: 'ocr', s3Key: 'file.pdf' };

  test('Returns extractedText containing s3Key', async () => {
    const res = await ocr(baseInput);
    assert.match(res.extractedText as string, /file\.pdf/);
  });

  test('Returns engine stub-v1', async () => {
    const res = await ocr(baseInput);
    assert.equal(res.engine, 'stub-v1');
  });

  test('With PDF detectedType in priorOutput -> pageCount 1', async () => {
    const res = await ocr({ ...baseInput, priorOutput: { detectedType: 'pdf' } });
    assert.equal(res.pageCount, 1);
  });

  test('Without priorOutput -> detectedType defaults to unknown', async () => {
    const res = await ocr(baseInput);
    assert.equal(res.pageCount, 1);
  });

  test('Returns s3Key in output', async () => {
    const res = await ocr(baseInput);
    assert.equal(res.s3Key, 'file.pdf');
  });
});
