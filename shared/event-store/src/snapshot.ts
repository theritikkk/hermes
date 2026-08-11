import { EventEnvelope } from '@hermes/domain';

export interface AggregateSnapshot<T> {
  aggregateId: string;
  sequence: number;
  state: T;
  createdAt: string;
}

export function shouldCreateSnapshot(sequence: number, snapshotThreshold = 50): boolean {
  return sequence > 0 && sequence % snapshotThreshold === 0;
}

export function loadSnapshotAndReplay<T>(
  snapshot: AggregateSnapshot<T> | null,
  events: EventEnvelope[],
  initialState: T,
  reducer: (state: T, event: EventEnvelope) => T,
): { finalState: T; eventsFolded: number } {
  let state = snapshot ? snapshot.state : initialState;
  const startSeq = snapshot ? snapshot.sequence : 0;

  const relevantEvents = events.filter((e) => e.sequence > startSeq);

  for (const event of relevantEvents) {
    state = reducer(state, event);
  }

  return {
    finalState: state,
    eventsFolded: relevantEvents.length,
  };
}
