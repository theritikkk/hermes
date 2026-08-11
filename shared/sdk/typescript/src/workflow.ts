/**
 * Hermes Fluent Workflow Builder
 *
 * Compile-time type-safe DSL for defining Hermes workflows. The builder
 * produces a validated {@link HermesWorkflowDefinition} and can compile
 * it directly to Amazon States Language (ASL) JSON for Step Functions.
 *
 * @example
 * ```typescript
 * const workflow = WorkflowBuilder
 *   .create('document-pipeline')
 *   .version(2)
 *   .addStep('validate', { activityName: 'ValidateActivity', timeoutSeconds: 30 })
 *   .addStep('ocr', {
 *     activityName: 'OcrActivity',
 *     timeoutSeconds: 120,
 *     retryPolicy: { maxAttempts: 3, intervalSeconds: 10, backoffRate: 2.0 },
 *     compensationActivity: 'OcrCompensateActivity',
 *   })
 *   .addParallelBranch('post-processing', branch => {
 *     branch.addStep('classify', { activityName: 'ClassifyActivity' });
 *     branch.addStep('ner', { activityName: 'NerActivity' });
 *   })
 *   .withCompensation({ activityName: 'GlobalCleanup', strategy: 'COMPENSATE_ALL' })
 *   .compileToASL();
 * ```
 */

import type {
  AmazonStatesLanguage,
  AslCatcher,
  AslParallelBranch,
  AslParallelState,
  AslRetrier,
  AslState,
  AslTaskState,
  CompensationConfig,
  HermesParallelBranchConfig,
  HermesStepConfig,
  HermesStepDefinition,
  HermesWorkflowDefinition,
  RetryPolicy,
} from './types.js';

//  Parallel Branch Builder 

/**
 * Fluent builder for a parallel branch within a {@link WorkflowBuilder}.
 * Passed as the callback argument to {@link WorkflowBuilder.addParallelBranch}.
 */
export class ParallelBranchBuilder {
  private readonly _branchName: string;
  private readonly _steps: HermesStepDefinition[] = [];

  /** @internal */
  constructor(branchName: string) {
    this._branchName = branchName;
  }

  /**
   * Adds a task step to this parallel branch.
   *
   * @param name   unique step name within this branch
   * @param config step configuration
   * @returns this builder (fluent)
   */
  addStep(name: string, config: HermesStepConfig = {}): this {
    this._steps.push({ name, type: 'task', config });
    return this;
  }

  /** @internal Called by WorkflowBuilder to extract the completed definition. */
  build(): HermesParallelBranchConfig {
    return { branchName: this._branchName, steps: this._steps };
  }
}

//  Workflow Builder 

/**
 * Fluent builder for Hermes workflow definitions.
 *
 * Designed for progressive disclosure: simple workflows are trivially short,
 * while complex workflows with retries, parallel branches, and compensation
 * are expressed cleanly without boilerplate.
 */
export class WorkflowBuilder {
  private readonly _name: string;
  private _version: number = 1;
  private readonly _steps: HermesStepDefinition[] = [];
  private _compensation: CompensationConfig | undefined;

  private constructor(name: string) {
    if (!name || name.trim().length === 0) {
      throw new Error('WorkflowBuilder: workflow name must not be empty');
    }
    this._name = name.trim();
  }

  //  Static factory 

  /**
   * Creates a new WorkflowBuilder for the given workflow name.
   *
   * @param name workflow name (must be unique within a tenant)
   */
  static create(name: string): WorkflowBuilder {
    return new WorkflowBuilder(name);
  }

  //  Builder methods 

  /**
   * Sets the semantic version of this workflow definition.
   * Executions are pinned to this version at registration time.
   *
   * @param version positive integer version number
   */
  version(v: number): this {
    if (!Number.isInteger(v) || v < 1) {
      throw new Error(`WorkflowBuilder: version must be a positive integer, got ${v}`);
    }
    this._version = v;
    return this;
  }

  /**
   * Appends a sequential task step.
   *
   * @param name   unique step name within this workflow
   * @param config step configuration (activity, timeout, retries, compensation)
   */
  addStep(name: string, config: HermesStepConfig = {}): this {
    this._validateStepName(name);
    this._steps.push({ name, type: 'task', config });
    return this;
  }

  /**
   * Appends a parallel execution state.
   * The callback receives a {@link ParallelBranchBuilder} to define each branch.
   *
   * @param name       step name for the parallel state
   * @param defineBranch callback that builds the branch contents
   */
  addParallelBranch(
    name: string,
    defineBranch: (branch: ParallelBranchBuilder) => void,
  ): this {
    this._validateStepName(name);
    const branchBuilder = new ParallelBranchBuilder(name);
    defineBranch(branchBuilder);
    this._steps.push({
      name,
      type: 'parallel',
      config: {},
      parallelBranches: [branchBuilder.build()],
    });
    return this;
  }

  /**
   * Configures global compensation behaviour for this workflow.
   * When a step fails and saga rollback is triggered, this governs the strategy.
   */
  withCompensation(config: CompensationConfig): this {
    this._compensation = config;
    return this;
  }

  //  Terminal operations 

  /**
   * Builds and returns the {@link HermesWorkflowDefinition} without ASL compilation.
   * Use this when you only need the definition for registration, not Step Functions deployment.
   */
  build(): HermesWorkflowDefinition {
    this._validate();
    return {
      name: this._name,
      version: this._version,
      steps: [...this._steps],
      compensation: this._compensation,
    };
  }

  /**
   * Compiles the workflow to Amazon States Language (ASL) JSON and returns
   * a {@link HermesWorkflowDefinition} with the {@link AmazonStatesLanguage} attached.
   *
   * The resulting `asl` object can be submitted directly to:
   * ```typescript
   * sfnClient.send(new CreateStateMachineCommand({ definition: JSON.stringify(def.asl) }))
   * ```
   */
  compileToASL(): HermesWorkflowDefinition {
    const definition = this.build();
    const asl = AslCompiler.compile(definition);
    return { ...definition, asl };
  }

  //  Private validation 

  private _validateStepName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error('WorkflowBuilder: step name must not be empty');
    }
    if (this._steps.some(s => s.name === name)) {
      throw new Error(`WorkflowBuilder: duplicate step name "${name}"`);
    }
  }

  private _validate(): void {
    if (this._steps.length === 0) {
      throw new Error(`WorkflowBuilder: workflow "${this._name}" must have at least one step`);
    }
  }
}

//  ASL Compiler 

/**
 * Transforms a {@link HermesWorkflowDefinition} into valid ASL JSON.
 *
 * Activity step resources default to the Hermes Lambda integration ARN pattern:
 * `arn:aws:lambda:${region}:${account}:function:hermes-${activityName}`
 *
 * This is resolved at deploy-time via SSM Parameter Store lookup in the CDK stack;
 * the SDK emits a symbolic ARN that the CDK deployment replaces.
 */
export class AslCompiler {
  private static readonly HERMES_RESOURCE_PREFIX =
    'arn:aws:states:::lambda:invoke';

  /**
   * Compiles a workflow definition to ASL.
   *
   * @throws {Error} if the workflow definition is invalid
   */
  static compile(definition: HermesWorkflowDefinition): AmazonStatesLanguage {
    const { name, version, steps } = definition;

    if (steps.length === 0) {
      throw new Error(`Cannot compile workflow "${name}" with no steps`);
    }

    const states: Record<string, AslState> = {};
    const stepNames = steps.map(s => s.name);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step === undefined) continue;

      const nextStep = stepNames[i + 1];
      const isLast = i === steps.length - 1;

      if (step.type === 'parallel') {
        states[step.name] = AslCompiler.compileParallel(step, nextStep, isLast);
      } else {
        states[step.name] = AslCompiler.compileTask(step, nextStep, isLast);
      }
    }

    return {
      Comment: `Hermes workflow: ${name} v${version}`,
      StartAt: stepNames[0] as string,
      States: states,
    };
  }

  private static compileTask(
    step: HermesStepDefinition,
    next: string | undefined,
    isLast: boolean,
  ): AslTaskState {
    const { activityName, timeoutSeconds, retryPolicy, catch: catchConfig, resourceArn } =
      step.config;

    const resource =
      resourceArn ??
      `${AslCompiler.HERMES_RESOURCE_PREFIX}.waitForTaskToken`;

    const state: AslTaskState = {
      Type: 'Task',
      Resource: resource,
      ...(timeoutSeconds !== undefined && { TimeoutSeconds: timeoutSeconds }),
      ...(activityName !== undefined && {
        Comment: `Activity: ${activityName}`,
      }),
    };

    if (retryPolicy) {
      state.Retry = [AslCompiler.compileRetrier(retryPolicy)];
    }

    if (catchConfig) {
      const catcher: AslCatcher = {
        ErrorEquals: [...catchConfig.errors],
        Next: catchConfig.next,
        ...(catchConfig.resultPath !== undefined && {
          ResultPath: catchConfig.resultPath,
        }),
      };
      state.Catch = [catcher];
    }

    if (isLast) {
      state.End = true;
    } else if (next !== undefined) {
      state.Next = next;
    }

    return state;
  }

  private static compileParallel(
    step: HermesStepDefinition,
    next: string | undefined,
    isLast: boolean,
  ): AslParallelState {
    const branches: AslParallelBranch[] = (step.parallelBranches ?? []).map(branch => {
      const branchStates: Record<string, AslState> = {};
      const branchStepNames = branch.steps.map(s => s.name);

      branch.steps.forEach((branchStep, idx) => {
        const branchNext = branchStepNames[idx + 1];
        const branchIsLast = idx === branch.steps.length - 1;
        branchStates[branchStep.name] = AslCompiler.compileTask(branchStep, branchNext, branchIsLast);
      });

      return {
        StartAt: branchStepNames[0] ?? step.name,
        States: branchStates,
      };
    });

    const state: AslParallelState = {
      Type: 'Parallel',
      Branches: branches,
    };

    if (isLast) {
      state.End = true;
    } else if (next !== undefined) {
      state.Next = next;
    }

    return state;
  }

  private static compileRetrier(policy: RetryPolicy): AslRetrier {
    return {
      ErrorEquals: policy.retryOn ? [...policy.retryOn] : ['States.ALL'],
      MaxAttempts: policy.maxAttempts,
      ...(policy.intervalSeconds !== undefined && {
        IntervalSeconds: policy.intervalSeconds,
      }),
      ...(policy.backoffRate !== undefined && {
        BackoffRate: policy.backoffRate,
      }),
      ...(policy.maxDelaySeconds !== undefined && {
        MaxDelaySeconds: policy.maxDelaySeconds,
      }),
    };
  }
}
