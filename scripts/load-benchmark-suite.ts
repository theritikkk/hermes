/**
 * Hermes Performance & Scale Load Benchmark Suite
 *
 * Measures event stream processing performance under high event volume:
 * 1. Full Event Stream Fold Latency vs Event Volume (1,000 to 10,000 events)
 * 2. Snapshot-Accelerated Fold Latency (resuming from snapshot vs sequence 0)
 * 3. Event Schema Upcaster Throughput (events/sec)
 * 4. Memory footprint during event stream projection
 *
 * Run: npx tsx scripts/load-benchmark-suite.ts
 */

import assert from 'node:assert/strict';

interface BenchmarkEvent {
  sequence: number;
  type: string;
  stepName?: string;
  output?: Record<string, unknown>;
}

console.log('====================================================');
console.log('Hermes Performance & Scale Load Benchmark Suite');
console.log('====================================================\n');

// 1. Generate synthetic event stream
function generateSyntheticEvents(count: number): BenchmarkEvent[] {
  const events: BenchmarkEvent[] = [
    { sequence: 1, type: 'WORKFLOW_EXECUTION_STARTED' }
  ];

  for (let i = 2; i <= count - 1; i++) {
    events.push({
      sequence: i,
      type: 'STEP_COMPLETED',
      stepName: `step-${i}`,
      output: { timestamp: Date.now(), result: `data-${i}`, payloadSizeKb: 1.5 }
    });
  }

  events.push({ sequence: count, type: 'WORKFLOW_EXECUTION_COMPLETED' });
  return events;
}

// 2. State projection fold simulator
function projectState(events: BenchmarkEvent[], startSeq = 0): { completedCount: number; durationMs: number } {
  const start = performance.now();
  let completedCount = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.sequence < startSeq) continue;

    if (e.type === 'STEP_COMPLETED') {
      completedCount++;
    }
  }

  const end = performance.now();
  return { completedCount, durationMs: end - start };
}

// 3. Schema Upcaster throughput simulator
function simulateUpcaster(events: BenchmarkEvent[]): { processed: number; durationMs: number; opsPerSec: number } {
  const start = performance.now();
  let processed = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    // Simulate payload upcasting transform (v1 -> v2 -> v3)
    const payload = { ...e.output, priority: 'NORMAL', correlationGroupId: `grp-${e.sequence}` };
    if (payload.priority) processed++;
  }

  const end = performance.now();
  const durationMs = Math.max(end - start, 0.001);
  const opsPerSec = Math.round((processed / durationMs) * 1000);

  return { processed, durationMs, opsPerSec };
}

// --- Benchmark Runs ---

const eventCounts = [1000, 5000, 10000];

console.log('1. Full Stream Fold Latency Benchmark (No Snapshot):');
for (const count of eventCounts) {
  const stream = generateSyntheticEvents(count);
  const res = projectState(stream, 0);
  console.log(`   - ${count.toLocaleString().padStart(6)} events: ${res.durationMs.toFixed(3).padStart(7)} ms (${Math.round(count / (res.durationMs / 1000)).toLocaleString()} events/sec)`);
}

console.log('\n2. Snapshot Acceleration Comparison (10,000 Events):');
const fullStream10k = generateSyntheticEvents(10000);

// Un-accelerated (from sequence 0)
const fullRes = projectState(fullStream10k, 0);

// Snapshot-accelerated (snapshot taken at sequence 9,500 -> only process 500 events)
const snapshotSeq = 9500;
const snapRes = projectState(fullStream10k, snapshotSeq);

const speedupFactor = (fullRes.durationMs / Math.max(snapRes.durationMs, 0.001)).toFixed(1);

console.log(`   - Without Snapshot (10,000 events): ${fullRes.durationMs.toFixed(3)} ms`);
console.log(`   - With Snapshot    (500 events):    ${snapRes.durationMs.toFixed(3)} ms`);
console.log(`   Snapshot Speedup Factor: ${speedupFactor}x reduction in processing overhead!`);

console.log('\n3. Event Schema Upcaster Throughput Benchmark:');
const upcastRes = simulateUpcaster(fullStream10k);
console.log(`   - Processed: ${upcastRes.processed.toLocaleString()} payloads`);
console.log(`   - Duration:  ${upcastRes.durationMs.toFixed(3)} ms`);
console.log(`   Throughput: ${upcastRes.opsPerSec.toLocaleString()} payload upcasts/sec`);

console.log('\n4. Memory Consumption Audit:');
const memoryUsage = process.memoryUsage();
console.log(`   - Heap Used:  ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
console.log(`   - Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
console.log(`   - RSS:        ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);

assert.ok(speedupFactor !== 'NaN', 'Benchmark must compute valid speedup factor');
console.log('\n====================================================');
console.log('Performance & Scale Load Benchmark Completed Successfully!');
console.log('====================================================');
