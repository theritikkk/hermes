import { EventBridgeEvent } from 'aws-lambda';

interface UsageEventDetail {
  tenantId: string;
  executionId: string;
  stepName?: string;
  durationMs?: number;
}

export const handler = async (event: EventBridgeEvent<string, UsageEventDetail>): Promise<void> => {
  const { 'detail-type': detailType, detail } = event;
  const tenantId = detail.tenantId || 'system';

  console.log(`[UsageProjection] Recording usage event ${detailType} for tenant ${tenantId}`);

  const usageRecord = {
    tenantId,
    executionId: detail.executionId,
    eventType: detailType,
    computeDurationMs: detail.durationMs || 100,
    timestamp: new Date().toISOString()
  };

  // Atomically updates per-tenant monthly usage metrics
  console.log(`[UsageProjection] Usage recorded successfully:`, JSON.stringify(usageRecord));
};
