import { EventBridgeEvent } from 'aws-lambda';
import * as crypto from 'crypto';

interface TerminalEventDetail {
  tenantId: string;
  executionId: string;
  workflowName?: string;
  status?: string;
  targetWebhookUrl?: string;
  secretKey?: string;
}

export const generateSignature = (payload: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

export const handler = async (event: EventBridgeEvent<string, TerminalEventDetail>): Promise<void> => {
  const { 'detail-type': detailType, detail } = event;
  console.log(`[WebhookDispatcher] Processing terminal event ${detailType} for execution ${detail.executionId}`);

  const webhookPayload = JSON.stringify({
    eventId: event.id,
    eventType: detailType,
    tenantId: detail.tenantId,
    executionId: detail.executionId,
    timestamp: new Date().toISOString(),
    detail
  });

  const secret = detail.secretKey || 'default_webhook_secret';
  const signature = generateSignature(webhookPayload, secret);
  const targetUrl = detail.targetWebhookUrl || 'http://localhost:8080/internal/webhooks/dummy';

  console.log(`[WebhookDispatcher] Dispatching webhook to ${targetUrl} (Signature: sha256=${signature})`);
};
