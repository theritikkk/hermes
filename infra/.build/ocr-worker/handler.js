"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const activity_runner_1 = require("@hermes/activity-runner");
async function ocr(input) {
    // Phase 1 stub: real OCR (Tesseract container) in Phase 2
    const detectedType = input.priorOutput?.detectedType ?? 'unknown';
    return {
        s3Key: input.s3Key,
        extractedText: `[stub-ocr] placeholder text for ${input.s3Key}`,
        pageCount: detectedType === 'pdf' ? 1 : 1,
        engine: 'stub-v1',
    };
}
const handler = async (event) => (0, activity_runner_1.runActivity)('ocr', event, ocr);
exports.handler = handler;
