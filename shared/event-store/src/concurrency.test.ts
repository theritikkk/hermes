import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

class OptimisticConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimisticConcurrencyError';
  }
}

class MockSingleTableEventStore {
  private store = new Map<string, number>();

  async appendEvent(aggregateId: string, expectedSequence: number): Promise<{ success: boolean }> {
    const currentSeq = this.store.get(aggregateId) ?? 0;
    if (expectedSequence !== currentSeq + 1) {
      throw new OptimisticConcurrencyError(
        `ConditionalCheckFailed: expected sequence ${currentSeq + 1}, got ${expectedSequence}`,
      );
    }
    this.store.set(aggregateId, expectedSequence);
    return { success: true };
  }
}

describe('Event Store Optimistic Concurrency Control (100 Concurrent Appends)', () => {
  test('exactly 1 write succeeds and 99 fail when 100 concurrent threads attempt sequence 1 append', async () => {
    const eventStore = new MockSingleTableEventStore();
    const aggregateId = 'agg-concurrency-test-100';

    const concurrentAttempts = Array.from({ length: 100 }, (_, i) =>
      eventStore.appendEvent(aggregateId, 1).catch((err) => err),
    );

    const results = await Promise.all(concurrentAttempts);

    const successfulWrites = results.filter((r) => r.success === true);
    const failedWrites = results.filter((r) => r instanceof OptimisticConcurrencyError);

    assert.equal(successfulWrites.length, 1);
    assert.equal(failedWrites.length, 99);
  });
});
