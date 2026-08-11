/**
 * Hermes SDK Test Suite
 *
 * Tests the WorkflowBuilder, AslCompiler, and HermesClient using Node's
 * built-in test runner (no external test framework required).
 *
 * Run: npm test  (uses tsx for TypeScript-native execution)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AslCompiler, ParallelBranchBuilder, WorkflowBuilder } from './workflow.js';
import { HermesApiError, HermesClient } from './client.js';
import type { AmazonStatesLanguage, AslParallelState, AslTaskState } from './types.js';

//  WorkflowBuilder 

describe('WorkflowBuilder', () => {

  it('creates a named workflow with correct name and default version 1', () => {
    const def = WorkflowBuilder.create('my-workflow').addStep('start').build();
    assert.equal(def.name, 'my-workflow');
    assert.equal(def.version, 1);
  });

  it('.version() sets the version', () => {
    const def = WorkflowBuilder.create('wf').version(3).addStep('s1').build();
    assert.equal(def.version, 3);
  });

  it('throws on non-positive version', () => {
    assert.throws(
      () => WorkflowBuilder.create('wf').version(0).addStep('s1').build(),
      /version must be a positive integer/,
    );
  });

  it('throws on empty workflow name', () => {
    assert.throws(() => WorkflowBuilder.create(''), /name must not be empty/);
  });

  it('throws on duplicate step names', () => {
    assert.throws(
      () => WorkflowBuilder.create('wf').addStep('validate').addStep('validate').build(),
      /duplicate step name/,
    );
  });

  it('throws on workflow with zero steps', () => {
    assert.throws(
      () => WorkflowBuilder.create('empty-wf').build(),
      /must have at least one step/,
    );
  });

  it('stores step configs correctly', () => {
    const def = WorkflowBuilder.create('pipeline')
      .addStep('validate', { activityName: 'ValidateActivity', timeoutSeconds: 30 })
      .addStep('ocr', { activityName: 'OcrActivity', timeoutSeconds: 120 })
      .build();

    assert.equal(def.steps.length, 2);
    assert.equal(def.steps[0]?.name, 'validate');
    assert.equal(def.steps[0]?.config.activityName, 'ValidateActivity');
    assert.equal(def.steps[1]?.config.timeoutSeconds, 120);
  });

  it('registers compensation config', () => {
    const def = WorkflowBuilder.create('saga-pipeline')
      .addStep('charge')
      .withCompensation({ activityName: 'RefundActivity', strategy: 'COMPENSATE_ALL' })
      .build();

    assert.equal(def.compensation?.activityName, 'RefundActivity');
    assert.equal(def.compensation?.strategy, 'COMPENSATE_ALL');
  });

  it('parallel branch is captured in step definition', () => {
    const def = WorkflowBuilder.create('parallel-wf')
      .addStep('start')
      .addParallelBranch('post-processing', branch => {
        branch.addStep('classify', { activityName: 'ClassifyActivity' });
        branch.addStep('ner', { activityName: 'NerActivity' });
      })
      .build();

    const parallelStep = def.steps[1];
    assert.equal(parallelStep?.type, 'parallel');
    assert.equal(parallelStep?.parallelBranches?.[0]?.steps.length, 2);
    assert.equal(parallelStep?.parallelBranches?.[0]?.steps[0]?.name, 'classify');
  });
});

//  AslCompiler 

describe('AslCompiler', () => {

  it('compiles single-step workflow to valid ASL', () => {
    const def = WorkflowBuilder.create('simple').addStep('validate').compileToASL();
    const asl = def.asl as AmazonStatesLanguage;

    assert.ok(asl);
    assert.equal(asl.StartAt, 'validate');
    assert.ok('validate' in asl.States);

    const validateState = asl.States['validate'] as AslTaskState;
    assert.equal(validateState.Type, 'Task');
    assert.equal(validateState.End, true);
    assert.equal(validateState.Next, undefined);
  });

  it('links sequential steps with Next pointers', () => {
    const def = WorkflowBuilder.create('pipeline')
      .addStep('validate')
      .addStep('ocr')
      .addStep('classify')
      .compileToASL();
    const asl = def.asl as AmazonStatesLanguage;

    assert.equal(asl.StartAt, 'validate');
    assert.equal((asl.States['validate'] as AslTaskState).Next, 'ocr');
    assert.equal((asl.States['ocr'] as AslTaskState).Next, 'classify');
    assert.equal((asl.States['classify'] as AslTaskState).End, true);
  });

  it('compiles timeout into ASL state', () => {
    const def = WorkflowBuilder.create('wf')
      .addStep('ocr', { timeoutSeconds: 300 })
      .compileToASL();
    const asl = def.asl as AmazonStatesLanguage;
    assert.equal((asl.States['ocr'] as AslTaskState).TimeoutSeconds, 300);
  });

  it('compiles retry policy into ASL Retry block', () => {
    const def = WorkflowBuilder.create('wf')
      .addStep('process', {
        retryPolicy: { maxAttempts: 3, intervalSeconds: 5, backoffRate: 2.0 },
      })
      .compileToASL();
    const asl = def.asl as AmazonStatesLanguage;
    const state = asl.States['process'] as AslTaskState;

    assert.ok(state.Retry);
    assert.equal(state.Retry[0]?.MaxAttempts, 3);
    assert.equal(state.Retry[0]?.IntervalSeconds, 5);
    assert.equal(state.Retry[0]?.BackoffRate, 2.0);
    assert.deepEqual(state.Retry[0]?.ErrorEquals, ['States.ALL']);
  });

  it('compiles custom error codes in retry', () => {
    const def = WorkflowBuilder.create('wf')
      .addStep('call', {
        retryPolicy: { maxAttempts: 2, retryOn: ['Lambda.ServiceException', 'Lambda.TooManyRequestsException'] },
      })
      .compileToASL();
    const asl = def.asl as AmazonStatesLanguage;
    const state = asl.States['call'] as AslTaskState;
    assert.deepEqual(state.Retry?.[0]?.ErrorEquals, ['Lambda.ServiceException', 'Lambda.TooManyRequestsException']);
  });

  it('compiles catch config into ASL Catch block', () => {
    const def = WorkflowBuilder.create('wf')
      .addStep('risky')
      .addStep('fallback')
      .build();

    // Manually compile to test catch separately
    const defWithCatch = WorkflowBuilder.create('wf2')
      .addStep('risky', {
        catch: { errors: ['States.ALL'], next: 'fallback', resultPath: '$.error' },
      })
      .addStep('fallback')
      .compileToASL();
    const asl = defWithCatch.asl as AmazonStatesLanguage;
    const state = asl.States['risky'] as AslTaskState;

    assert.ok(state.Catch);
    assert.equal(state.Catch[0]?.Next, 'fallback');
    assert.equal(state.Catch[0]?.ResultPath, '$.error');
    assert.deepEqual(state.Catch[0]?.ErrorEquals, ['States.ALL']);
  });

  it('compiles parallel state with correct branch structure', () => {
    const def = WorkflowBuilder.create('parallel-pipeline')
      .addStep('start')
      .addParallelBranch('fan-out', branch => {
        branch.addStep('classify', { activityName: 'ClassifyActivity' });
        branch.addStep('ner', { activityName: 'NerActivity' });
      })
      .compileToASL();
    const asl = def.asl as AmazonStatesLanguage;

    const parallelState = asl.States['fan-out'] as AslParallelState;
    assert.equal(parallelState.Type, 'Parallel');
    assert.equal(parallelState.End, true);
    assert.equal(parallelState.Branches.length, 1);

    const branch = parallelState.Branches[0];
    assert.ok(branch);
    assert.equal(branch.StartAt, 'classify');
    assert.ok('classify' in branch.States);
    assert.ok('ner' in branch.States);

    const classifyState = branch.States['classify'] as AslTaskState;
    assert.equal(classifyState.Next, 'ner');

    const nerState = branch.States['ner'] as AslTaskState;
    assert.equal(nerState.End, true);
  });

  it('ASL has Comment field with workflow name and version', () => {
    const def = WorkflowBuilder.create('doc-pipeline').version(3).addStep('validate').compileToASL();
    const asl = def.asl as AmazonStatesLanguage;
    assert.match(asl.Comment ?? '', /doc-pipeline/);
    assert.match(asl.Comment ?? '', /v3/);
  });

  it('throws on empty step name', () => {
    assert.throws(
      () => WorkflowBuilder.create('wf').addStep('').build(),
      /step name must not be empty/,
    );
  });

  it('compileToASL attaches asl to workflow definition', () => {
    const def = WorkflowBuilder.create('full')
      .version(2)
      .addStep('step1')
      .compileToASL();

    assert.ok(def.asl);
    assert.equal(def.name, 'full');
    assert.equal(def.version, 2);
  });
});

//  ParallelBranchBuilder 

describe('ParallelBranchBuilder', () => {
  it('builds branch with correct name and steps', () => {
    const builder = new ParallelBranchBuilder('post-processing');
    builder.addStep('classify').addStep('ner');
    const branch = builder.build();

    assert.equal(branch.branchName, 'post-processing');
    assert.equal(branch.steps.length, 2);
    assert.equal(branch.steps[0]?.name, 'classify');
    assert.equal(branch.steps[1]?.name, 'ner');
  });
});

//  HermesClient 

describe('HermesClient constructor validation', () => {
  const validConfig = {
    commandApiUrl: 'https://cmd.hermes.test',
    replayApiUrl: 'https://replay.hermes.test',
    tenantId: 'tenant-test',
    accessToken: 'test-token',
  };

  it('constructs successfully with valid config', () => {
    const client = new HermesClient(validConfig);
    assert.ok(client instanceof HermesClient);
  });

  it('throws if commandApiUrl is empty', () => {
    assert.throws(
      () => new HermesClient({ ...validConfig, commandApiUrl: '' }),
      /commandApiUrl is required/,
    );
  });

  it('throws if tenantId is empty', () => {
    assert.throws(
      () => new HermesClient({ ...validConfig, tenantId: '' }),
      /tenantId is required/,
    );
  });

  it('throws if accessToken is empty', () => {
    assert.throws(
      () => new HermesClient({ ...validConfig, accessToken: '' }),
      /accessToken is required/,
    );
  });
});

describe('HermesApiError', () => {
  it('carries statusCode and endpoint', () => {
    const err = new HermesApiError(404, '/executions/abc', 'Execution not found');
    assert.equal(err.statusCode, 404);
    assert.equal(err.endpoint, '/executions/abc');
    assert.match(err.message, /404/);
    assert.match(err.message, /Execution not found/);
    assert.equal(err.name, 'HermesApiError');
  });
});

//  Full document-pipeline: integration scenario 

describe('document-pipeline integration scenario', () => {
  it('compiles the canonical document-pipeline v1 workflow correctly', () => {
    const pipeline = WorkflowBuilder.create('document-pipeline')
      .version(1)
      .addStep('validate', { activityName: 'ValidateActivity', timeoutSeconds: 30 })
      .addStep('ocr', {
        activityName: 'OcrActivity',
        timeoutSeconds: 120,
        retryPolicy: { maxAttempts: 3, intervalSeconds: 10, backoffRate: 2.0 },
        compensationActivity: 'OcrCompensateActivity',
      })
      .addParallelBranch('post-processing', branch => {
        branch.addStep('classify', { activityName: 'ClassifyActivity' });
        branch.addStep('ner', { activityName: 'NerActivity' });
      })
      .withCompensation({ activityName: 'GlobalCleanupActivity', strategy: 'COMPENSATE_ALL' })
      .compileToASL();

    assert.equal(pipeline.name, 'document-pipeline');
    assert.equal(pipeline.version, 1);
    assert.equal(pipeline.compensation?.strategy, 'COMPENSATE_ALL');

    const asl = pipeline.asl as AmazonStatesLanguage;
    assert.equal(asl.StartAt, 'validate');
    assert.equal(Object.keys(asl.States).length, 3); // validate, ocr, post-processing

    // validate  ocr
    assert.equal((asl.States['validate'] as AslTaskState).Next, 'ocr');
    // ocr has retry
    assert.ok((asl.States['ocr'] as AslTaskState).Retry);
    // ocr  post-processing (parallel)
    assert.equal((asl.States['ocr'] as AslTaskState).Next, 'post-processing');
    // post-processing is terminal
    assert.equal((asl.States['post-processing'] as AslParallelState).End, true);
  });
});
