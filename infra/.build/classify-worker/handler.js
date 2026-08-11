"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const activity_runner_1 = require("@hermes/activity-runner");
async function classify(input) {
    const text = input.priorOutput?.extractedText ?? '';
    const label = text.includes('invoice') ? 'invoice' : 'general';
    return {
        s3Key: input.s3Key,
        classification: label,
        confidence: 0.85,
        classifier: 'stub-v1',
    };
}
const handler = async (event) => (0, activity_runner_1.runActivity)('classify', event, classify);
exports.handler = handler;
