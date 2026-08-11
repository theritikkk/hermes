import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleRegisterAsset,
  handleRecordStepResult,
} from '@hermes/command-handlers';
import { EventEnvelope, EventTypes } from '@hermes/domain';

interface ReadModelExecution {
  status: string;
  workflowName: string;
  workflowVersion: number;
  assetId: string;
  s3Key: string;
  tenantId: string;
  steps: Record<string, { status: string; output?: any; error?: string }>;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  lastEventId?: string;
}

/**
 * End-to-End Integration Pipeline Test
 * Exercises: Command API -> Event Store -> Outbox/EventBridge Bus -> CQRS Projections -> Read State
 */
describe('End-to-End System Integration Flow', () => {
  const tenantId = 'tenant-corp-acme';
  const assetId = 'asset-doc-9901';
  const s3Key = 'documents/2026/invoice-9901.pdf';

  test('executes complete document-pipeline-v1 lifecycle from ingestion to projection read state', async () => {
    // 1. In-Memory Event Store & Bus infrastructure setup
    const eventStream: EventEnvelope[] = [];
    const busEvents: EventEnvelope[] = [];
    const readModelStore: Record<string, ReadModelExecution> = {};

    const mockEventStore = {
      loadStream: async (_type: string, _id: string) => eventStream,
      append: async (params: any) => {
        const seq = eventStream.length + 1;
        const envelope: EventEnvelope = {
          eventId: `evt-uuid-${seq}`,
          eventType: params.eventType,
          eventVersion: params.eventVersion ?? 1,
          aggregateType: params.aggregateType,
          aggregateId: params.aggregateId,
          tenantId: params.tenantId,
          correlationId: params.correlationId,
          occurredAt: new Date().toISOString(),
          sequence: seq,
          payload: params.payload,
        };
        eventStream.push(envelope);
        return envelope;
      },
    };

    const mockPublisher = {
      publish: async (evts: EventEnvelope[]) => {
        busEvents.push(...evts);
        // Simulate async EventBridge -> CQRS Projection consumption
        for (const evt of evts) {
          projectToReadModel(evt, readModelStore);
        }
      },
    };

    const deps = { eventStore: mockEventStore as any, publisher: mockPublisher as any };

    // CQRS Projection Simulator (mirrors execution-projection Lambda)
    function projectToReadModel(evt: EventEnvelope, store: Record<string, ReadModelExecution>) {
      const key = `TENANT#${evt.tenantId}#EXEC#${evt.correlationId}`;
      if (!store[key]) {
        store[key] = {
          status: 'PENDING',
          workflowName: '',
          workflowVersion: 1,
          assetId: '',
          s3Key: '',
          tenantId: evt.tenantId,
          steps: {},
        };
      }

      const item = store[key];

      switch (evt.eventType) {
        case EventTypes.WorkflowExecutionStarted:
          item.status = 'RUNNING';
          item.workflowName = evt.payload.workflowName as string;
          item.workflowVersion = evt.payload.workflowVersion as number;
          item.assetId = evt.payload.assetId as string;
          item.s3Key = evt.payload.s3Key as string;
          item.startedAt = evt.occurredAt;
          item.lastEventId = evt.eventId;
          break;

        case EventTypes.StepCompleted: {
          const stepName = evt.payload.stepName as string;
          item.steps[stepName] = {
            status: 'completed',
            output: evt.payload.output,
          };
          item.lastEventId = evt.eventId;
          break;
        }

        case EventTypes.WorkflowExecutionCompleted:
          item.status = 'COMPLETED';
          item.completedAt = evt.occurredAt;
          item.lastEventId = evt.eventId;
          break;

        case EventTypes.WorkflowExecutionFailed:
          item.status = 'FAILED';
          item.failedAt = evt.occurredAt;
          item.lastEventId = evt.eventId;
          break;
      }
    }

    // ── STEP 1: Command API — RegisterAsset ──────────────────────────────────────────
    const regResult = await handleRegisterAsset(
      {
        commandType: 'RegisterAsset',
        tenantId,
        assetId,
        s3Key,
        contentType: 'application/pdf',
        workflowName: 'document-pipeline-v1',
        workflowVersion: 1,
      },
      deps,
    );

    assert.equal(regResult.accepted, true);
    assert.equal(regResult.aggregateId, assetId);
    assert.ok(regResult.executionId);
    const executionId = regResult.executionId!;

    // Assert Event Store has AssetRegistered (seq 1) and WorkflowExecutionStarted (seq 2)
    assert.equal(eventStream.length, 2);
    assert.equal(eventStream[0].eventType, EventTypes.AssetRegistered);
    assert.equal(eventStream[1].eventType, EventTypes.WorkflowExecutionStarted);

    // Assert Read Model projected RUNNING state
    const readKey = `TENANT#${tenantId}#EXEC#${executionId}`;
    assert.ok(readModelStore[readKey]);
    assert.equal(readModelStore[readKey].status, 'RUNNING');
    assert.equal(readModelStore[readKey].assetId, assetId);

    // ── STEP 2: Activity Worker 1 — validate ─────────────────────────────────────────
    const valResult = await handleRecordStepResult(
      {
        commandType: 'RecordStepResult',
        tenantId,
        executionId,
        stepName: 'validate',
        status: 'completed',
        output: { valid: true, checksum: 'sha256-abc123' },
      },
      deps,
    );

    assert.equal(valResult.accepted, true);
    assert.equal(readModelStore[readKey].steps['validate'].status, 'completed');
    assert.deepEqual(readModelStore[readKey].steps['validate'].output, {
      valid: true,
      checksum: 'sha256-abc123',
    });

    // ── STEP 3: Activity Worker 2 — ocr ──────────────────────────────────────────────
    const ocrResult = await handleRecordStepResult(
      {
        commandType: 'RecordStepResult',
        tenantId,
        executionId,
        stepName: 'ocr',
        status: 'completed',
        output: { pageCount: 2, extractedTextLength: 1450 },
      },
      deps,
    );

    assert.equal(ocrResult.accepted, true);
    assert.equal(readModelStore[readKey].steps['ocr'].status, 'completed');

    // ── STEP 4: Activity Worker 3 — classify (Terminal Step) ─────────────────────────
    const classifyResult = await handleRecordStepResult(
      {
        commandType: 'RecordStepResult',
        tenantId,
        executionId,
        stepName: 'classify',
        status: 'completed',
        output: { documentCategory: 'INVOICE', confidenceScore: 0.98 },
      },
      deps,
    );

    assert.equal(classifyResult.accepted, true);

    // ── STEP 5: Final End-to-End System State Verification ──────────────────────────
    // Event Store verified total events = 6 (AssetReg + WfStart + StepVal + StepOcr + StepClassify + WfComp)
    assert.equal(eventStream.length, 6);

    // Verify Read Model reflected terminal COMPLETED state
    const finalState = readModelStore[readKey];
    assert.equal(finalState.status, 'COMPLETED');
    assert.ok(finalState.completedAt);
    assert.equal(Object.keys(finalState.steps).length, 3);
    assert.equal(finalState.steps['validate'].status, 'completed');
    assert.equal(finalState.steps['ocr'].status, 'completed');
    assert.equal(finalState.steps['classify'].status, 'completed');

    // Bus events verified match stream events
    assert.equal(busEvents.length, 6);
  });
});
