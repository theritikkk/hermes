import type { Handler } from 'aws-lambda';
import { runActivity, ActivityInput } from '@hermes/activity-runner';

export async function classify(input: ActivityInput): Promise<Record<string, unknown>> {
  const text = (input.priorOutput?.extractedText as string) ?? '';
  const label = text.includes('invoice') ? 'invoice' : 'general';
  return {
    s3Key: input.s3Key,
    classification: label,
    confidence: 0.85,
    classifier: 'stub-v1',
  };
}

export const handler: Handler = async (event) =>
  runActivity('classify', event as ActivityInput, classify);
