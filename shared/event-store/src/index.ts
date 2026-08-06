import { randomUUID } from 'node:crypto';
import {
  DynamoDBClient,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  AggregateType,
  DomainEvent,
  EventEnvelope,
  aggregatePk,
  eventSk,
} from '@hermes/domain';

export interface AppendEventInput {
  aggregateType: AggregateType;
  aggregateId: string;
  tenantId: string;
  correlationId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  expectedVersion: number;
}

export interface EventStore {
  loadStream(
    aggregateType: AggregateType,
    aggregateId: string,
  ): Promise<EventEnvelope[]>;
  append(input: AppendEventInput): Promise<EventEnvelope>;
}

export class DynamoEventStore implements EventStore {
  constructor(
    private readonly tableName: string,
    private readonly doc: DynamoDBDocumentClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({}),
      { marshallOptions: { removeUndefinedValues: true } },
    ),
  ) {}

  async loadStream(
    aggregateType: AggregateType,
    aggregateId: string,
  ): Promise<EventEnvelope[]> {
    const pk = aggregatePk(aggregateType, aggregateId);
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'itemType = :eventType',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':sk': 'EVT#',
          ':eventType': 'EVENT',
        },
        ScanIndexForward: true,
      }),
    );

    return (result.Items ?? []).map(itemToEvent);
  }

  async append(input: AppendEventInput): Promise<EventEnvelope> {
    const sequence = input.expectedVersion + 1;
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const pk = aggregatePk(input.aggregateType, input.aggregateId);
    const sk = eventSk(sequence, eventId);

    const event: EventEnvelope = {
      eventId,
      eventType: input.eventType,
      eventVersion: input.eventVersion,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      occurredAt,
      sequence,
      payload: input.payload,
      publishedAt: null,
    };

    const metaSk = 'META';

    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: pk,
            SK: metaSk,
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
            tenantId: input.tenantId,
            version: sequence,
            updatedAt: occurredAt,
          },
          ConditionExpression:
            'attribute_not_exists(version) OR version = :expectedVersion',
          ExpressionAttributeValues: {
            ':expectedVersion': input.expectedVersion,
          },
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new ConcurrencyError(input.aggregateType, input.aggregateId);
      }
      throw err;
    }

    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: pk,
          SK: sk,
          GSI1PK: `TENANT#${input.tenantId}#${input.aggregateType}`,
          GSI1SK: occurredAt,
          itemType: 'EVENT',
          ...event,
        },
        ConditionExpression: 'attribute_not_exists(SK)',
      }),
    );

    return event;
  }
}

export class ConcurrencyError extends Error {
  constructor(
    public readonly aggregateType: AggregateType,
    public readonly aggregateId: string,
  ) {
    super(`Concurrency conflict on ${aggregateType}:${aggregateId}`);
    this.name = 'ConcurrencyError';
  }
}

function itemToEvent(item: Record<string, unknown>): EventEnvelope {
  return {
    eventId: item.eventId as string,
    eventType: item.eventType as string,
    eventVersion: item.eventVersion as number,
    aggregateType: item.aggregateType as AggregateType,
    aggregateId: item.aggregateId as string,
    tenantId: item.tenantId as string,
    correlationId: item.correlationId as string,
    occurredAt: item.occurredAt as string,
    sequence: item.sequence as number,
    payload: item.payload as Record<string, unknown>,
    publishedAt: (item.publishedAt as string | null | undefined) ?? null,
  };
}

export function replayAggregate<T>(
  events: EventEnvelope[],
  initial: T,
  apply: (state: T, event: EventEnvelope) => T,
): T {
  return events.reduce(apply, initial);
}

export type { DomainEvent };
export { EventBridgePublisher, type EventPublisher } from './publisher';
