import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { EventEnvelope } from '@hermes/domain';

export interface EventPublisher {
  publish(events: EventEnvelope[]): Promise<void>;
}

export class EventBridgePublisher implements EventPublisher {
  constructor(
    private readonly busName: string,
    private readonly source: string,
    private readonly client: EventBridgeClient = new EventBridgeClient({}),
  ) {}

  async publish(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;

    const entries = events.map((event) => ({
      EventBusName: this.busName,
      Source: this.source,
      DetailType: event.eventType,
      Detail: JSON.stringify({
        eventId: event.eventId,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        occurredAt: event.occurredAt,
        sequence: event.sequence,
        payload: event.payload,
      }),
    }));

    const result = await this.client.send(
      new PutEventsCommand({ Entries: entries }),
    );

    if (result.FailedEntryCount && result.FailedEntryCount > 0) {
      throw new Error(`EventBridge publish failed: ${result.FailedEntryCount} entries`);
    }
  }
}
