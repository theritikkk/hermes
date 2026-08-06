import type { Handler } from 'aws-lambda';
import { runActivity, ActivityInput } from '@hermes/activity-runner';

async function ocr(input: ActivityInput): Promise<Record<string, unknown>> {
  // Phase 1 stub: real OCR (Tesseract container) in Phase 2
  const detectedType = (input.priorOutput?.detectedType as string) ?? 'unknown';
  return {
    s3Key: input.s3Key,
    extractedText: `[stub-ocr] placeholder text for ${input.s3Key}`,
    pageCount: detectedType === 'pdf' ? 1 : 1,
    engine: 'stub-v1',
  };
}

export const handler: Handler = async (event) =>
  runActivity('ocr', event as ActivityInput, ocr);
