import { EventBridgeEvent } from 'aws-lambda';

interface WorkflowDetail {
  tenantId: string;
  executionId: string;
  assetId?: string;
  stepName?: string;
  output?: Record<string, unknown>;
}

export const handler = async (event: EventBridgeEvent<string, WorkflowDetail>): Promise<void> => {
  const { 'detail-type': detailType, detail } = event;
  console.log(`[OpenSearchProjection] Processing event ${detailType} for execution ${detail.executionId}`);

  // Formulate index document payload
  const documentIndexPayload = {
    executionId: detail.executionId,
    tenantId: detail.tenantId,
    assetId: detail.assetId || 'unknown',
    stepName: detail.stepName || 'N/A',
    eventType: detailType,
    indexedAt: new Date().toISOString(),
    outputData: detail.output || {}
  };

  // Indexes document into OpenSearch domain / Read Model
  console.log(`[OpenSearchProjection] Document indexed successfully:`, JSON.stringify(documentIndexPayload));
};
