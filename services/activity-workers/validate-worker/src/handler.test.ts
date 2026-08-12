import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './handler';
import { ActivityInput } from '@hermes/activity-runner';

describe('validate worker', () => {
  const baseInput: ActivityInput = { executionId: 'ex1', stepName: 'validate' };

  test('Valid PDF s3Key -> valid and detectedType pdf', async () => {
    const res = await validate({ ...baseInput, s3Key: 'docs/file.pdf' });
    assert.deepEqual(res, { valid: true, detectedType: 'pdf', s3Key: 'docs/file.pdf' });
  });

  test('Valid PNG -> detectedType png', async () => {
    const res = await validate({ ...baseInput, s3Key: 'img.png' });
    assert.equal(res.detectedType, 'png');
  });

  test('Valid JPG -> detectedType jpg', async () => {
    const res = await validate({ ...baseInput, s3Key: 'img.jpg' });
    assert.equal(res.detectedType, 'jpg');
  });

  test('Valid JPEG -> detectedType jpeg', async () => {
    const res = await validate({ ...baseInput, s3Key: 'img.jpeg' });
    assert.equal(res.detectedType, 'jpeg');
  });

  test('Valid TXT -> detectedType txt', async () => {
    const res = await validate({ ...baseInput, s3Key: 'doc.txt' });
    assert.equal(res.detectedType, 'txt');
  });

  test('Valid CSV -> detectedType csv', async () => {
    const res = await validate({ ...baseInput, s3Key: 'data.csv' });
    assert.equal(res.detectedType, 'csv');
  });

  test('Missing s3Key (undefined) -> rejects', async () => {
    await assert.rejects(validate({ ...baseInput }), /s3Key is required/);
  });

  test('Unsupported extension (.exe) -> rejects', async () => {
    await assert.rejects(validate({ ...baseInput, s3Key: 'file.exe' }), /unsupported file type: exe/);
  });

  test('No extension -> rejects', async () => {
    await assert.rejects(validate({ ...baseInput, s3Key: 'filename' }), /unsupported file type/);
  });

  test('Case insensitive extension (.PDF) -> works', async () => {
    const res = await validate({ ...baseInput, s3Key: 'file.PDF' });
    assert.equal(res.detectedType, 'pdf');
  });
});
