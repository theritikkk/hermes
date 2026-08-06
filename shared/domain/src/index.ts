export const DEFAULT_TENANT_ID = 'tenant-dev';

export type AggregateType = 'WorkflowExecution' | 'Asset' | 'Idempotency';

export const OUTBOX_STATUS = { PENDING: 'PENDING', PUBLISHED: 'PUBLISHED' } as const;

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: AggregateType;
  aggregateId: string;
  tenantId: string;
  correlationId: string;
  occurredAt: string;
  sequence: number;
  payload: TPayload;
  publishedAt?: string | null;
}

export interface AssetRegisteredPayload {
  assetId: string;
  s3Key: string;
  contentType: string;
  workflowName: string;
  workflowVersion: number;
}

export interface WorkflowExecutionStartedPayload {
  executionId: string;
  workflowName: string;
  workflowVersion: number;
  assetId: string;
  s3Key: string;
}

export interface StepScheduledPayload {
  executionId: string;
  stepName: string;
  input: Record<string, unknown>;
}

export interface StepCompletedPayload {
  executionId: string;
  stepName: string;
  output: Record<string, unknown>;
}

export interface StepFailedPayload {
  executionId: string;
  stepName: string;
  error: string;
  retryable: boolean;
}

export interface WorkflowExecutionCompletedPayload {
  executionId: string;
}

export interface WorkflowExecutionFailedPayload {
  executionId: string;
  reason: string;
}

export interface WorkflowExecutionReplayStartedPayload {
  executionId: string;
  parentExecutionId: string;
  fromStep: string;
  replayReason: string;
  cachedOutputs: Record<string, unknown>;
  workflowName: string;
  workflowVersion: number;
}

export interface CompensationTriggeredPayload {
  executionId: string;
  stepName: string;
  reason: string;
}

export type DomainEvent =
  | EventEnvelope<AssetRegisteredPayload>
  | EventEnvelope<WorkflowExecutionStartedPayload>
  | EventEnvelope<StepScheduledPayload>
  | EventEnvelope<StepCompletedPayload>
  | EventEnvelope<StepFailedPayload>
  | EventEnvelope<WorkflowExecutionCompletedPayload>
  | EventEnvelope<WorkflowExecutionFailedPayload>
  | EventEnvelope<WorkflowExecutionReplayStartedPayload>
  | EventEnvelope<CompensationTriggeredPayload>;

export const EventTypes = {
  AssetRegistered: 'AssetRegistered',
  WorkflowExecutionStarted: 'WorkflowExecutionStarted',
  StepScheduled: 'StepScheduled',
  StepCompleted: 'StepCompleted',
  StepFailed: 'StepFailed',
  WorkflowExecutionCompleted: 'WorkflowExecutionCompleted',
  WorkflowExecutionFailed: 'WorkflowExecutionFailed',
  WorkflowExecutionReplayStarted: 'WorkflowExecutionReplayStarted',
  CompensationTriggered: 'CompensationTriggered',
} as const;

export interface RegisterAssetCommand {
  commandType: 'RegisterAsset';
  tenantId: string;
  assetId: string;
  s3Key: string;
  contentType: string;
  workflowName?: string;
  workflowVersion?: number;
  clientRequestId?: string;
}

export interface RecordStepResultCommand {
  commandType: 'RecordStepResult';
  tenantId: string;
  executionId: string;
  stepName: string;
  status: 'completed' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
  retryable?: boolean;
}

export type Command = RegisterAssetCommand | RecordStepResultCommand;

export type ExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

export interface StepState {
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
  completedAt?: string;
}

export interface WorkflowExecutionAggregate {
  executionId: string;
  tenantId: string;
  workflowName: string;
  workflowVersion: number;
  assetId: string;
  status: ExecutionStatus;
  steps: Record<string, StepState>;
  version: number;
}

export interface AssetAggregate {
  assetId: string;
  tenantId: string;
  s3Key: string;
  contentType: string;
  workflowName: string;
  workflowVersion: number;
  registered: boolean;
  version: number;
}

export function aggregatePk(aggregateType: AggregateType, aggregateId: string): string {
  return `AGG#${aggregateType}#${aggregateId}`;
}

export function eventSk(sequence: number, eventId: string): string {
  return `EVT#${String(sequence).padStart(10, '0')}#${eventId}`;
}

export function idempotencyKey(executionId: string, stepName: string): string {
  return `${executionId}#${stepName}`;
}
