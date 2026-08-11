"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const activity_runner_1 = require("@hermes/activity-runner");
async function validate(input) {
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
const handler = async (event) => (0, activity_runner_1.runActivity)('validate', event, validate);
exports.handler = handler;
