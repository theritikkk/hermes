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
  output?: Record<string, unknown>;
}

export interface WorkflowExecutionFailedPayload {
  executionId: string;
  reason: string;
  failedStep?: string;
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

export interface RetryScheduledPayload {
  executionId: string;
  stepName: string;
  attemptNumber: number;
  delayMs: number;
  nextAttemptAt: string;
  error: string;
}

export interface SnapshotCreatedPayload {
  executionId: string;
  sequence: number;
  snapshotArn?: string;
  takenAt: string;
}

export interface WebhookDeliveredPayload {
  executionId: string;
  webhookUrl: string;
  httpStatus: number;
  deliveredAt: string;
  attempt: number;
}

export interface NotificationSentPayload {
  executionId: string;
  channel: 'EMAIL' | 'SLACK' | 'SMS' | 'SNS';
  recipient: string;
  sentAt: string;
}

export interface ExecutionCancelledPayload {
  executionId: string;
  cancelledBy: string;
  reason: string;
  cancelledAt: string;
}

export interface ExecutionTimedOutPayload {
  executionId: string;
  timeoutSeconds: number;
  timedOutAtStep?: string;
}

export interface ExecutionRetriedPayload {
  executionId: string;
  previousExecutionId: string;
  attemptNumber: number;
  retriedAt: string;
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
  | EventEnvelope<CompensationTriggeredPayload>
  | EventEnvelope<RetryScheduledPayload>
  | EventEnvelope<SnapshotCreatedPayload>
  | EventEnvelope<WebhookDeliveredPayload>
  | EventEnvelope<NotificationSentPayload>
  | EventEnvelope<ExecutionCancelledPayload>
  | EventEnvelope<ExecutionTimedOutPayload>
  | EventEnvelope<ExecutionRetriedPayload>;

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
  RetryScheduled: 'RetryScheduled',
  SnapshotCreated: 'SnapshotCreated',
  WebhookDelivered: 'WebhookDelivered',
  NotificationSent: 'NotificationSent',
  ExecutionCancelled: 'ExecutionCancelled',
  ExecutionTimedOut: 'ExecutionTimedOut',
  ExecutionRetried: 'ExecutionRetried',
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
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'RETRIED';

export interface StepState {
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retry_scheduled';
  output?: Record<string, unknown>;
  error?: string;
  completedAt?: string;
  nextAttemptAt?: string;
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

// ---------------------------------------------------------------------------
// Phase 7: Authentication, Tenant Isolation & RBAC
// ---------------------------------------------------------------------------
export type Role = 'Admin' | 'User' | 'Service';

export interface AuthContext {
  tenantId: string;
  userId: string;
  roles: Role[];
  isAuthenticated: boolean;
}

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export class RBACError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RBACError';
  }
}

export function extractAuthContext(event: any): AuthContext {
  const claims = event.requestContext?.authorizer?.jwt?.claims;

  if (claims) {
    const tenantId = (
      claims['custom:tenantId'] ??
      claims['custom:tenant_id'] ??
      claims['tenantId'] ??
      DEFAULT_TENANT_ID
    ) as string;

    const userId = (
      claims['sub'] ??
      claims['username'] ??
      'anonymous'
    ) as string;

    const rawGroups = claims['cognito:groups'] ?? claims['roles'] ?? claims['custom:role'];
    const roles: Role[] = Array.isArray(rawGroups)
      ? (rawGroups.map(String) as Role[])
      : typeof rawGroups === 'string'
      ? ([rawGroups] as Role[])
      : ['User'];

    return { tenantId, userId, roles, isAuthenticated: true };
  }

  // Fallback for unauthenticated / header-based dev access
  const headerTenant = event.headers?.['x-tenant-id'] || event.headers?.['X-Tenant-ID'];
  const headerRole = event.headers?.['x-role'] || event.headers?.['X-Role'];
  const roles: Role[] = headerRole
    ? [headerRole as Role]
    : ['Admin', 'User', 'Service'];

  return {
    tenantId: headerTenant || DEFAULT_TENANT_ID,
    userId: 'dev-user',
    roles,
    isAuthenticated: false,
  };
}

export function enforceTenantIsolation(auth: AuthContext, requestedTenantId?: string): string {
  // Admin role can operate across tenants if explicit requestedTenantId is provided
  if (auth.roles.includes('Admin') && requestedTenantId) {
    return requestedTenantId;
  }

  // Non-admin users cannot access or impersonate another tenant
  if (requestedTenantId && requestedTenantId !== auth.tenantId && !auth.roles.includes('Admin')) {
    throw new TenantIsolationError(
      `TenantIsolationError: Caller tenant '${auth.tenantId}' cannot access tenant '${requestedTenantId}'`,
    );
  }

  return auth.tenantId;
}

export function enforceRBAC(auth: AuthContext, requiredRole: Role): void {
  // Admin role has full system privileges
  if (auth.roles.includes('Admin')) return;

  if (!auth.roles.includes(requiredRole)) {
    throw new RBACError(
      `RBACError: Required role '${requiredRole}' missing. Caller roles: [${auth.roles.join(', ')}]`,
    );
  }
}

