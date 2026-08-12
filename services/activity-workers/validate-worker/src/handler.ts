import type { Handler } from 'aws-lambda';
import { runActivity, ActivityInput } from '@hermes/activity-runner';

export async function validate(input: ActivityInput): Promise<Record<string, unknown>> {
  if (!input.s3Key) {
    throw new Error('s3Key is required for validate');
  }
  const extension = input.s3Key.split('.').pop()?.toLowerCase();
  const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv'];
  if (!extension || !allowed.includes(extension)) {
    throw new Error(`unsupported file type: ${extension ?? 'unknown'}`);
  }
  return {
    valid: true,
    s3Key: input.s3Key,
    detectedType: extension,
  };
}

export const handler: Handler = async (event) =>
  runActivity('validate', event as ActivityInput, validate);
