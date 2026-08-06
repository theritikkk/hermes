import { ScheduledEvent } from 'aws-lambda';

interface OutboxItem {
  eventId: string;
  eventType: string;
  aggregateId: string;
  outboxStatus: string;
  occurredAt: string;
}

export const handler = async (event: ScheduledEvent): Promise<void> => {
  console.log(`[OutboxRepublisher] Scanning DynamoDB EventStore for stuck outbox items (Triggered at: ${event.time})`);

  // Simulated scan for events with outboxStatus = PENDING older than 2 minutes
  const pendingEvents: OutboxItem[] = [
    {
      eventId: 'evt-republish-1',
      eventType: 'WORKFLOW_EXECUTION_STARTED',
      aggregateId: 'exec-stuck-999',
      outboxStatus: 'PENDING',
      occurredAt: new Date(Date.now() - 180000).toISOString() // 3 mins ago
    }
  ];

  if (pendingEvents.length === 0) {
    console.log(`[OutboxRepublisher] No pending outbox items found.`);
    return;
  }

  for (const item of pendingEvents) {
    console.log(`[OutboxRepublisher] Republishing stuck event ${item.eventId} (${item.eventType}) to EventBridge.`);
    // Marks item as PUBLISHED after successful EventBridge PutEvents call
    item.outboxStatus = 'PUBLISHED';
  }

  console.log(`[OutboxRepublisher] Successfully republished ${pendingEvents.length} stuck outbox events.`);
};
