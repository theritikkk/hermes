import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleRegisterAsset, handleRecordStepResult } from './index';
import { EventEnvelope, EventTypes } from '@hermes/domain';

describe('Command Handlers Domain Logic', () => {
  const mockDeps = () => {
    const events: EventEnvelope[] = [];
    const published: EventEnvelope[][] = [];

    const eventStore = {
      loadStream: async (_type: string, _id: string) => events,
      append: async (params: any) => {
        const evt: EventEnvelope = {
          eventId: `evt-${events.length + 1}`,
          eventType: params.eventType,
          eventVersion: params.eventVersion ?? 1,
          aggregateType: params.aggregateType,
          aggregateId: params.aggregateId,
          tenantId: params.tenantId,
          correlationId: params.correlationId,
          occurredAt: new Date().toISOString(),
          sequence: events.length + 1,
          payload: params.payload,
        };
        events.push(evt);
        return evt;
      },
    };

    const publisher = {
      publish: async (evts: EventEnvelope[]) => {
        published.push(evts);
      },
    };

    return { eventStore: eventStore as any, publisher: publisher as any, events, published };
  };

  test('handleRegisterAsset appends AssetRegistered and WorkflowExecutionStarted events', async () => {
    const deps = mockDeps();
    const command = {
      commandType: 'RegisterAsset' as const,
      tenantId: 'tenant-test',
      assetId: 'asset-100',
      s3Key: 'test/doc.pdf',
      contentType: 'application/pdf',
      workflowName: 'document-pipeline-v1',
      workflowVersion: 1,
    };

    const result = await handleRegisterAsset(command, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.aggregateId, 'asset-100');
    assert.ok(result.executionId);
    assert.equal(deps.events.length, 2);
    assert.equal(deps.events[0].eventType, EventTypes.AssetRegistered);
    assert.equal(deps.events[1].eventType, EventTypes.WorkflowExecutionStarted);
  });

  test('handleRecordStepResult records step completion and appends terminal event for classify step', async () => {
    const deps = mockDeps();
    const command = {
      commandType: 'RecordStepResult' as const,
      tenantId: 'tenant-test',
      executionId: 'exec-200',
      stepName: 'classify',
      status: 'completed' as const,
      output: { classification: 'INVOICE' },
    };

    const result = await handleRecordStepResult(command, deps);

    assert.equal(result.accepted, true);
    assert.equal(deps.events.length, 2);
    assert.equal(deps.events[0].eventType, EventTypes.StepCompleted);
    assert.equal(deps.events[1].eventType, EventTypes.WorkflowExecutionCompleted);
  });

  test('handleRecordStepResult appends StepFailed and WorkflowExecutionFailed on non-retryable error', async () => {
    const deps = mockDeps();
    const command = {
      commandType: 'RecordStepResult' as const,
      tenantId: 'tenant-test',
      executionId: 'exec-300',
      stepName: 'validate',
      status: 'failed' as const,
      error: 'Unparseable PDF header',
      retryable: false,
    };

    const result = await handleRecordStepResult(command, deps);

    assert.equal(result.accepted, true);
    assert.equal(deps.events.length, 2);
    assert.equal(deps.events[0].eventType, EventTypes.StepFailed);
    assert.equal(deps.events[1].eventType, EventTypes.WorkflowExecutionFailed);
  });
});
