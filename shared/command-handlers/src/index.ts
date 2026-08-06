import { randomUUID } from 'node:crypto';
import {
  RegisterAssetCommand,
  RecordStepResultCommand,
  EventTypes,
  WorkflowExecutionAggregate,
  AssetAggregate,
  EventEnvelope,
  DEFAULT_TENANT_ID,
} from '@hermes/domain';
import { DynamoEventStore, EventPublisher, replayAggregate } from '@hermes/event-store';

const DOCUMENT_PIPELINE = 'document-pipeline';
const DOCUMENT_PIPELINE_VERSION = 1;

export interface CommandResult {
  accepted: true;
  aggregateId: string;
  executionId?: string;
  events: EventEnvelope[];
}

export interface CommandHandlerDeps {
  eventStore: DynamoEventStore;
  publisher: EventPublisher;
}

function applyWorkflowEvent(
  state: WorkflowExecutionAggregate,
  event: EventEnvelope,
): WorkflowExecutionAggregate {
  switch (event.eventType) {
    case EventTypes.WorkflowExecutionStarted:
      return {
        ...state,
        status: 'RUNNING',
        version: event.sequence,
      };
    case EventTypes.StepCompleted: {
      const payload = event.payload as { stepName: string; output: Record<string, unknown> };
      return {
        ...state,
        steps: {
          ...state.steps,
          [payload.stepName]: {
            stepName: payload.stepName,
            status: 'completed',
            output: payload.output,
            completedAt: event.occurredAt,
          },
        },
        version: event.sequence,
      };
    }
    case EventTypes.StepFailed: {
      const payload = event.payload as { stepName: string; error: string };
      return {
        ...state,
        steps: {
          ...state.steps,
          [payload.stepName]: {
            stepName: payload.stepName,
            status: 'failed',
            error: payload.error,
            completedAt: event.occurredAt,
          },
        },
        version: event.sequence,
      };
    }
    case EventTypes.WorkflowExecutionCompleted:
      return { ...state, status: 'COMPLETED', version: event.sequence };
    case EventTypes.WorkflowExecutionFailed:
      return { ...state, status: 'FAILED', version: event.sequence };
    default:
      return { ...state, version: event.sequence };
  }
}

function applyAssetEvent(state: AssetAggregate, event: EventEnvelope): AssetAggregate {
  if (event.eventType === EventTypes.AssetRegistered) {
    return { ...state, registered: true, version: event.sequence };
  }
  return state;
}

export async function handleRegisterAsset(
  command: RegisterAssetCommand,
  deps: CommandHandlerDeps,
): Promise<CommandResult> {
  const tenantId = command.tenantId || DEFAULT_TENANT_ID;
  const workflowName = command.workflowName ?? DOCUMENT_PIPELINE;
  const workflowVersion = command.workflowVersion ?? DOCUMENT_PIPELINE_VERSION;

  const assetEvents = await deps.eventStore.loadStream('Asset', command.assetId);
  const assetState = replayAggregate(
    assetEvents,
    {
      assetId: command.assetId,
      tenantId,
      s3Key: command.s3Key,
      contentType: command.contentType,
      workflowName,
      workflowVersion,
      registered: false,
      version: 0,
    } satisfies AssetAggregate,
    applyAssetEvent,
  );

  if (assetState.registered) {
    return { accepted: true, aggregateId: command.assetId, events: [] };
  }

  const assetEvent = await deps.eventStore.append({
    aggregateType: 'Asset',
    aggregateId: command.assetId,
    tenantId,
    correlationId: command.assetId,
    eventType: EventTypes.AssetRegistered,
    eventVersion: 1,
    payload: {
      assetId: command.assetId,
      s3Key: command.s3Key,
      contentType: command.contentType,
      workflowName,
      workflowVersion,
    },
    expectedVersion: assetState.version,
  });

  const executionId = randomUUID();
  const workflowEvent = await deps.eventStore.append({
    aggregateType: 'WorkflowExecution',
    aggregateId: executionId,
    tenantId,
    correlationId: executionId,
    eventType: EventTypes.WorkflowExecutionStarted,
    eventVersion: 1,
    payload: {
      executionId,
      workflowName,
      workflowVersion,
      assetId: command.assetId,
      s3Key: command.s3Key,
    },
    expectedVersion: 0,
  });

  const events = [assetEvent, workflowEvent];
  await deps.publisher.publish(events);

  // Orchestration kickoff: EventBridge rule targets Step Functions directly
  // (see infra/modules/eventbridge-sfn-target). command-api does not call StartExecution.

  return { accepted: true, aggregateId: command.assetId, executionId, events };
}

export async function handleRecordStepResult(
  command: RecordStepResultCommand,
  deps: CommandHandlerDeps,
): Promise<CommandResult> {
  const events = await deps.eventStore.loadStream('WorkflowExecution', command.executionId);
  const state = replayAggregate(
    events,
    {
      executionId: command.executionId,
      tenantId: command.tenantId,
      workflowName: DOCUMENT_PIPELINE,
      workflowVersion: DOCUMENT_PIPELINE_VERSION,
      assetId: '',
      status: 'PENDING',
      steps: {},
      version: 0,
    } satisfies WorkflowExecutionAggregate,
    applyWorkflowEvent,
  );

  const existing = state.steps[command.stepName];
  if (existing?.status === 'completed') {
    return { accepted: true, aggregateId: command.executionId, events: [] };
  }

  const isFailed = command.status === 'failed';
  const stepEvent = await deps.eventStore.append({
    aggregateType: 'WorkflowExecution',
    aggregateId: command.executionId,
    tenantId: command.tenantId,
    correlationId: command.executionId,
    eventType: isFailed ? EventTypes.StepFailed : EventTypes.StepCompleted,
    eventVersion: 1,
    payload: isFailed
      ? {
          executionId: command.executionId,
          stepName: command.stepName,
          error: command.error ?? 'unknown error',
          retryable: command.retryable ?? false,
        }
      : {
          executionId: command.executionId,
          stepName: command.stepName,
          output: command.output ?? {},
        },
    expectedVersion: state.version,
  });

  const published: EventEnvelope[] = [stepEvent];

  if (!isFailed && isTerminalStep(command.stepName)) {
    const completeEvent = await deps.eventStore.append({
      aggregateType: 'WorkflowExecution',
      aggregateId: command.executionId,
      tenantId: command.tenantId,
      correlationId: command.executionId,
      eventType: EventTypes.WorkflowExecutionCompleted,
      eventVersion: 1,
      payload: { executionId: command.executionId },
      expectedVersion: stepEvent.sequence,
    });
    published.push(completeEvent);
  }

  if (isFailed && !command.retryable) {
    const failEvent = await deps.eventStore.append({
      aggregateType: 'WorkflowExecution',
      aggregateId: command.executionId,
      tenantId: command.tenantId,
      correlationId: command.executionId,
      eventType: EventTypes.WorkflowExecutionFailed,
      eventVersion: 1,
      payload: {
        executionId: command.executionId,
        reason: command.error ?? 'step failed',
      },
      expectedVersion: stepEvent.sequence,
    });
    published.push(failEvent);
  }

  await deps.publisher.publish(published);
  return { accepted: true, aggregateId: command.executionId, events: published };
}

function isTerminalStep(stepName: string): boolean {
  return stepName === 'classify';
}
