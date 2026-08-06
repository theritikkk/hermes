import { DynamoEventStore, EventBridgePublisher } from '@hermes/event-store';
import { handleRecordStepResult } from '@hermes/command-handlers';
import { DEFAULT_TENANT_ID, idempotencyKey } from '@hermes/domain';
import { logInfo, logError } from '@hermes/observability';

export interface ActivityInput {
  executionId: string;
  tenantId?: string;
  stepName: string;
  s3Key?: string;
  priorOutput?: Record<string, unknown>;
}

export type ActivityFn = (input: ActivityInput) => Promise<Record<string, unknown>>;

export async function runActivity(
  stepName: string,
  input: ActivityInput,
  execute: ActivityFn,
): Promise<Record<string, unknown>> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const ctx = {
    service: `activity-${stepName}`,
    correlationId: input.executionId,
    executionId: input.executionId,
    tenantId,
  };

  const eventStore = new DynamoEventStore(process.env.EVENT_STORE_TABLE!);
  const publisher = new EventBridgePublisher(
    process.env.EVENT_BUS_NAME!,
    `hermes.activity.${stepName}`,
  );

  logInfo('activity started', ctx, { idempotencyKey: idempotencyKey(input.executionId, stepName) });

  try {
    const output = await execute({ ...input, tenantId, stepName });
    await handleRecordStepResult(
      {
        commandType: 'RecordStepResult',
        tenantId,
        executionId: input.executionId,
        stepName,
        status: 'completed',
        output,
      },
      { eventStore, publisher },
    );
    logInfo('activity completed', ctx);
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await handleRecordStepResult(
      {
        commandType: 'RecordStepResult',
        tenantId,
        executionId: input.executionId,
        stepName,
        status: 'failed',
        error: message,
        retryable: true,
      },
      { eventStore, publisher },
    );
    logError('activity failed', ctx, { error: message });
    throw err;
  }
}
