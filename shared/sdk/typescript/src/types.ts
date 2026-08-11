/**
 * Hermes Workflow SDK  Core Types
 *
 * These types model the Step Functions ASL (Amazon States Language) JSON
 * that the WorkflowBuilder compiles to. They are intentionally structural,
 * matching exactly what Step Functions expects, so the compiled output can
 * be submitted directly to the AWS SDK CreateStateMachine API.
 */

//  Retry & Catch 

export interface RetryPolicy {
  /** Maximum number of attempts (including the first). */
  readonly maxAttempts: number;
  /** Initial delay between retries in seconds. */
  readonly intervalSeconds?: number;
  /** Backoff multiplier (e.g. 2.0 = exponential doubling). */
  readonly backoffRate?: number;
  /** Maximum interval cap in seconds. */
  readonly maxDelaySeconds?: number;
  /** Error codes to retry on. Defaults to ["States.ALL"]. */
  readonly retryOn?: readonly string[];
}

export interface CatchConfig {
  /** Error codes to catch. Use "States.ALL" to catch everything. */
  readonly errors: readonly string[];
  /** State to transition to on catch. */
  readonly next: string;
  /** Optional ResultPath where the error info is injected. */
  readonly resultPath?: string;
}

//  Compensation 

export type CompensationStrategy =
  | 'COMPENSATE_ALL'       // roll back every completed step in LIFO order
  | 'COMPENSATE_FAILED'    // roll back only the failed step
  | 'FAIL_FAST';           // no compensation, surface error immediately

export interface CompensationConfig {
  /** Name of the compensation activity (Lambda function / worker handler). */
  readonly activityName: string;
  readonly strategy: CompensationStrategy;
}

//  Step types 

export type StepType = 'task' | 'wait' | 'choice' | 'parallel' | 'pass' | 'succeed' | 'fail';

export interface HermesStepConfig {
  /** Lambda / worker activity to invoke. */
  readonly activityName?: string;
  readonly timeoutSeconds?: number;
  readonly retryPolicy?: RetryPolicy;
  readonly catch?: CatchConfig;
  /** Optional step that compensates this one on saga rollback. */
  readonly compensationActivity?: string;
  /** JSONPath expression for the resource ARN when targeting Lambda/ECS. */
  readonly resourceArn?: string;
}

export interface HermesParallelBranchConfig {
  readonly branchName: string;
  readonly steps: readonly HermesStepDefinition[];
}

export interface HermesStepDefinition {
  readonly name: string;
  readonly type: StepType;
  readonly config: HermesStepConfig;
  readonly parallelBranches?: readonly HermesParallelBranchConfig[];
}

//  Workflow definition 

export interface HermesWorkflowDefinition {
  readonly name: string;
  readonly version: number;
  readonly steps: readonly HermesStepDefinition[];
  readonly compensation?: CompensationConfig;
  /** Compiled ASL JSON. Set by WorkflowBuilder.compileToASL(). */
  readonly asl?: AmazonStatesLanguage;
}

//  Amazon States Language (ASL) types 

export interface AslRetrier {
  ErrorEquals: string[];
  IntervalSeconds?: number;
  MaxAttempts?: number;
  BackoffRate?: number;
  MaxDelaySeconds?: number;
}

export interface AslCatcher {
  ErrorEquals: string[];
  Next: string;
  ResultPath?: string;
}

export interface AslTaskState {
  Type: 'Task';
  Resource: string;
  TimeoutSeconds?: number;
  Retry?: AslRetrier[];
  Catch?: AslCatcher[];
  Next?: string;
  End?: boolean;
  Comment?: string;
}

export interface AslPassState {
  Type: 'Pass';
  Next?: string;
  End?: boolean;
  Result?: unknown;
}

export interface AslSucceedState {
  Type: 'Succeed';
}

export interface AslFailState {
  Type: 'Fail';
  Error?: string;
  Cause?: string;
}

export interface AslParallelBranch {
  StartAt: string;
  States: Record<string, AslState>;
}

export interface AslParallelState {
  Type: 'Parallel';
  Branches: AslParallelBranch[];
  Next?: string;
  End?: boolean;
  Retry?: AslRetrier[];
  Catch?: AslCatcher[];
}

export type AslState =
  | AslTaskState
  | AslPassState
  | AslSucceedState
  | AslFailState
  | AslParallelState;

export interface AmazonStatesLanguage {
  Comment?: string;
  StartAt: string;
  States: Record<string, AslState>;
}

//  Execution types 

export interface HermesExecutionInput {
  readonly tenantId: string;
  readonly assetId: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly idempotencyKey?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface HermesExecutionStatus {
  readonly executionId: string;
  readonly tenantId: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly steps: Record<string, HermesStepStatus>;
}

export interface HermesStepStatus {
  readonly stepName: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly output?: Record<string, unknown>;
  readonly error?: string;
  readonly completedAt?: string;
}

export interface ReplayRequest {
  readonly executionId: string;
  readonly fromStep?: string;
  readonly replayToSequence?: number;
  readonly replayToTimestamp?: string;
  readonly skipCompletedSteps?: boolean;
  readonly reason: string;
}

export interface ReplayResponse {
  readonly replayJobId: string;
  readonly executionId: string;
  readonly status: string;
  readonly eventsReplayed: number;
  readonly stepsSkipped: number;
  readonly replayedStepNames: string[];
  readonly cachedOutputsInjected: Record<string, unknown>;
  readonly projectedToSequence: number;
  readonly message: string;
}
