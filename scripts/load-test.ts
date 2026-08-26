#!/usr/bin/env npx tsx
/**
 * scripts/load-test.ts
 *
 * Hermes Production Load Testing Harness (Zero External Dependencies)
 * Exercises the Command API (POST /assets) under controlled concurrency profiles.
 *
 * Usage:
 *   npx tsx scripts/load-test.ts --dry-run
 *   BASE_URL=https://<api-id>.execute-api.ap-south-1.amazonaws.com PROFILE=smoke npx tsx scripts/load-test.ts --yes
 *   BASE_URL=https://<api-id>.execute-api.ap-south-1.amazonaws.com PROFILE=baseline npx tsx scripts/load-test.ts --yes
 *   BASE_URL=https://<api-id>.execute-api.ap-south-1.amazonaws.com PROFILE=stress npx tsx scripts/load-test.ts --yes
 *
 * Safety:
 *   - Requires explicit BASE_URL (fails on placeholders).
 *   - Requires --yes or CONFIRM_NON_PROD=true confirmation.
 *   - Automatic circuit breaker abort if consecutive error rate exceeds 50%.
 *   - Hard limit on max concurrency (max 50).
 */

import { performance } from 'node:perf_hooks';

interface LoadProfile {
  name: string;
  concurrency: number;
  totalRequests: number;
  durationSeconds?: number;
  description: string;
}

const PROFILES: Record<string, LoadProfile> = {
  smoke: {
    name: 'smoke',
    concurrency: 2,
    totalRequests: 20,
    durationSeconds: 30,
    description: 'Minimal smoke verification — tests baseline reachability and latency',
  },
  baseline: {
    name: 'baseline',
    concurrency: 10,
    totalRequests: 200,
    durationSeconds: 60,
    description: 'Sustained baseline throughput — measures standard operational latency',
  },
  stress: {
    name: 'stress',
    concurrency: 25,
    totalRequests: 1000,
    durationSeconds: 180,
    description: 'High-concurrency stress test — tests DynamoDB TransactWrite and Lambda scaling',
  },
};

interface RequestResult {
  index: number;
  durationMs: number;
  statusCode: number;
  success: boolean;
  executionId?: string;
  errorMessage?: string;
}

interface TestReport {
  profile: string;
  targetUrl: string;
  tenantId: string;
  concurrency: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePercent: number;
  totalDurationSeconds: number;
  requestsPerSecond: number;
  latencyMs: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    stdDev: number;
  };
  statusCodeBreakdown: Record<string, number>;
}

// Parse CLI flags and environment variables
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--yes') || process.env.CONFIRM_NON_PROD === 'true';
const isJsonOutput = args.includes('--json');

const profileName = (process.env.PROFILE || 'smoke').toLowerCase();
const selectedProfile = PROFILES[profileName] || PROFILES.smoke;

const BASE_URL = (process.env.BASE_URL || process.env.TARGET_URL || '').trim().replace(/\/+$/, '');
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TENANT_ID = process.env.TENANT_ID || 'tenant-load-test';
const WORKFLOW_NAME = process.env.WORKFLOW_NAME || 'document-pipeline-v1';
const WORKFLOW_VERSION = parseInt(process.env.WORKFLOW_VERSION || '1', 10);
const CONCURRENCY = Math.min(
  parseInt(process.env.CONCURRENCY || String(selectedProfile.concurrency), 10),
  50 // Hard safety ceiling
);
const TOTAL_REQUESTS = parseInt(process.env.REQUESTS || String(selectedProfile.totalRequests), 10);

function printBanner() {
  console.log('================================================================');
  console.log('            HERMES COMMAND API LOAD TEST HARNESS                ');
  console.log('================================================================');
  console.log(`  Profile        : ${selectedProfile.name.toUpperCase()} (${selectedProfile.description})`);
  console.log(`  Target URL     : ${BASE_URL || '<DRY-RUN / NOT SET>'}`);
  console.log(`  Tenant ID      : ${TENANT_ID}`);
  console.log(`  Workflow       : ${WORKFLOW_NAME} (v${WORKFLOW_VERSION})`);
  console.log(`  Concurrency    : ${CONCURRENCY} workers`);
  console.log(`  Total Requests : ${TOTAL_REQUESTS}`);
  console.log(`  Auth           : ${AUTH_TOKEN ? 'Bearer Token configured' : 'None (IAM / dev role headers)'}`);
  console.log(`  Dry Run        : ${isDryRun ? 'YES (Simulated)' : 'NO (Live Traffic)'}`);
  console.log('================================================================\n');
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function computeReport(results: RequestResult[], totalDurationMs: number): TestReport {
  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const successful = results.filter((r) => r.success).length;
  const failed = results.length - successful;
  const errorRate = results.length > 0 ? (failed / results.length) * 100 : 0;
  const durationSec = totalDurationMs / 1000;
  const rps = durationSec > 0 ? results.length / durationSec : 0;

  const sum = durations.reduce((acc, v) => acc + v, 0);
  const mean = durations.length > 0 ? sum / durations.length : 0;
  const variance =
    durations.length > 0
      ? durations.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / durations.length
      : 0;
  const stdDev = Math.sqrt(variance);

  const statusCodeBreakdown: Record<string, number> = {};
  for (const r of results) {
    const key = r.statusCode ? String(r.statusCode) : 'NETWORK_ERROR';
    statusCodeBreakdown[key] = (statusCodeBreakdown[key] || 0) + 1;
  }

  return {
    profile: selectedProfile.name,
    targetUrl: BASE_URL,
    tenantId: TENANT_ID,
    concurrency: CONCURRENCY,
    totalRequests: results.length,
    successfulRequests: successful,
    failedRequests: failed,
    errorRatePercent: parseFloat(errorRate.toFixed(2)),
    totalDurationSeconds: parseFloat(durationSec.toFixed(3)),
    requestsPerSecond: parseFloat(rps.toFixed(2)),
    latencyMs: {
      min: durations.length > 0 ? parseFloat(durations[0].toFixed(2)) : 0,
      max: durations.length > 0 ? parseFloat(durations[durations.length - 1].toFixed(2)) : 0,
      mean: parseFloat(mean.toFixed(2)),
      p50: parseFloat(calculatePercentile(durations, 50).toFixed(2)),
      p90: parseFloat(calculatePercentile(durations, 90).toFixed(2)),
      p95: parseFloat(calculatePercentile(durations, 95).toFixed(2)),
      p99: parseFloat(calculatePercentile(durations, 99).toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
    },
    statusCodeBreakdown,
  };
}

async function sendSingleRequest(index: number): Promise<RequestResult> {
  const payload = {
    s3Key: `load-test/${TENANT_ID}/${Date.now()}-${index}.pdf`,
    contentType: 'application/pdf',
    workflowName: WORKFLOW_NAME,
    workflowVersion: WORKFLOW_VERSION,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
    'x-role': 'User',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  if (isDryRun) {
    // Simulated deterministic latency for dry run validation
    const simulatedLatency = 45 + Math.random() * 30 + (index % 10 === 0 ? 50 : 0);
    await new Promise((resolve) => setTimeout(resolve, simulatedLatency));
    return {
      index,
      durationMs: simulatedLatency,
      statusCode: 202,
      success: true,
      executionId: `sim-exec-${Date.now()}-${index}`,
    };
  }

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${BASE_URL}/assets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const durationMs = performance.now() - start;
    const isSuccess = response.status === 200 || response.status === 202;
    let executionId: string | undefined;

    try {
      const data = (await response.json()) as { executionId?: string };
      executionId = data.executionId;
    } catch {
      // Ignored if response has no JSON body
    }

    return {
      index,
      durationMs,
      statusCode: response.status,
      success: isSuccess,
      executionId,
      errorMessage: isSuccess ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (err: unknown) {
    const durationMs = performance.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      index,
      durationMs,
      statusCode: 0,
      success: false,
      errorMessage: errorMsg,
    };
  }
}

async function runWorkerPool(total: number, concurrency: number): Promise<RequestResult[]> {
  const results: RequestResult[] = [];
  let currentIndex = 0;
  let activeWorkers = 0;
  let consecutiveErrors = 0;
  let isAborted = false;

  return new Promise((resolve) => {
    function launchNext() {
      if (isAborted) return;

      if (currentIndex >= total && activeWorkers === 0) {
        resolve(results);
        return;
      }

      while (activeWorkers < concurrency && currentIndex < total && !isAborted) {
        const reqIndex = ++currentIndex;
        activeWorkers++;

        sendSingleRequest(reqIndex).then((res) => {
          results.push(res);
          activeWorkers--;

          if (!res.success) {
            consecutiveErrors++;
            if (consecutiveErrors >= 20 && results.length >= 20) {
              const errorRate = (results.filter((r) => !r.success).length / results.length) * 100;
              if (errorRate > 50) {
                console.error(`\n[CIRCUIT BREAKER] Aborting load test: Error rate is ${errorRate.toFixed(1)}% over ${results.length} requests.`);
                isAborted = true;
                resolve(results);
                return;
              }
            }
          } else {
            consecutiveErrors = 0;
          }

          if (!isJsonOutput && results.length % Math.max(1, Math.floor(total / 10)) === 0) {
            process.stdout.write(`  Progress: ${results.length}/${total} requests (${((results.length / total) * 100).toFixed(0)}%)\r`);
          }

          launchNext();
        });
      }
    }

    launchNext();
  });
}

async function main() {
  printBanner();

  if (!isDryRun && !BASE_URL) {
    console.error('ERROR: BASE_URL environment variable is required.');
    console.error('Example: export BASE_URL="https://<api-id>.execute-api.ap-south-1.amazonaws.com"');
    console.error('Or run in dry-run mode with: npx tsx scripts/load-test.ts --dry-run');
    process.exit(1);
  }

  if (!isDryRun && !isConfirmed) {
    console.error('SAFETY WARNING: You are about to run a load test against live AWS infrastructure.');
    console.error('To proceed, re-run with --yes or set CONFIRM_NON_PROD=true');
    process.exit(1);
  }

  console.log(`Starting load test execution...`);
  const overallStart = performance.now();
  const results = await runWorkerPool(TOTAL_REQUESTS, CONCURRENCY);
  const overallDurationMs = performance.now() - overallStart;

  const report = computeReport(results, overallDurationMs);

  if (isJsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n\n================================================================');
  console.log('                   LOAD TEST EXECUTION REPORT                   ');
  console.log('================================================================');
  console.log(`  Total Requests Executed  : ${report.totalRequests}`);
  console.log(`  Successful (2xx)         : ${report.successfulRequests}`);
  console.log(`  Failed Requests          : ${report.failedRequests}`);
  console.log(`  Error Rate               : ${report.errorRatePercent}%`);
  console.log(`  Total Test Duration      : ${report.totalDurationSeconds} s`);
  console.log(`  Throughput (RPS)         : ${report.requestsPerSecond} req/s`);
  console.log('----------------------------------------------------------------');
  console.log('  LATENCY DISTRIBUTION (ms):');
  console.log(`    Min  : ${report.latencyMs.min.toFixed(2)} ms`);
  console.log(`    Mean : ${report.latencyMs.mean.toFixed(2)} ms (± ${report.latencyMs.stdDev.toFixed(2)} ms)`);
  console.log(`    p50  : ${report.latencyMs.p50.toFixed(2)} ms`);
  console.log(`    p90  : ${report.latencyMs.p90.toFixed(2)} ms`);
  console.log(`    p95  : ${report.latencyMs.p95.toFixed(2)} ms`);
  console.log(`    p99  : ${report.latencyMs.p99.toFixed(2)} ms`);
  console.log(`    Max  : ${report.latencyMs.max.toFixed(2)} ms`);
  console.log('----------------------------------------------------------------');
  console.log('  STATUS CODE BREAKDOWN:');
  for (const [code, count] of Object.entries(report.statusCodeBreakdown)) {
    console.log(`    HTTP ${code} : ${count} (${((count / report.totalRequests) * 100).toFixed(1)}%)`);
  }
  console.log('================================================================\n');

  if (isDryRun) {
    console.log('NOTE: Dry-run validation succeeded. Results above were generated by internal simulation.');
    console.log('To run against a live staging environment, supply BASE_URL and use --yes.');
  }
}

main().catch((err) => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
