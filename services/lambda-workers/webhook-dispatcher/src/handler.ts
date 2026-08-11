/**
 * webhook-dispatcher
 *
 * Triggered by EventBridge on WorkflowExecutionCompleted / WorkflowExecutionFailed.
 * Looks up the tenant's webhook endpoint from an SSM Parameter Store path
 * (/hermes/{environment}/tenants/{tenantId}/webhookUrl) and delivers a signed
 * HTTP POST with exponential backoff (up to 3 attempts).
 *
 * Signature header: X-Hermes-Signature: sha256=<hmac-sha256-hex>
 * Secret source:    SSM /hermes/{environment}/tenants/{tenantId}/webhookSecret
 *
 * If SSM parameters are absent the delivery is skipped (tenant not configured).
 * Failed delivery after all retries throws so SQS/EventBridge can DLQ the message.
 */
import type { EventBridgeEvent } from 'aws-lambda';
import { createHmac } from 'node:crypto';
import {
  SSMClient,
  GetParameterCommand,
  ParameterNotFound,
} from '@aws-sdk/client-ssm';
import { createLogger } from '@hermes/observability';

const ssm = new SSMClient({});
const ENV = process.env.ENVIRONMENT ?? 'dev';
const MAX_ATTEMPTS = 3;

interface IntegrationEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// SSM helpers (cached per Lambda container)
// ---------------------------------------------------------------------------
const paramCache = new Map<string, string>();

async function getParam(name: string): Promise<string | null> {
  if (paramCache.has(name)) return paramCache.get(name)!;
  try {
    const res = await ssm.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    const value = res.Parameter?.Value ?? null;
    if (value) paramCache.set(name, value);
    return value;
  } catch (err) {
    if (err instanceof ParameterNotFound) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// HTTP delivery with exponential backoff
// ---------------------------------------------------------------------------
async function deliverWithRetry(
  url: string,
  body: string,
  signature: string,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hermes-Signature': `sha256=${signature}`,
          'X-Hermes-Delivery-Attempt': String(attempt),
          'User-Agent': 'Hermes-WebhookDispatcher/1.0',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        log.info('webhook delivered', { url, attempt, status: res.status });
        return;
      }

      const text = await res.text().catch(() => '');
      log.warn('webhook delivery non-2xx', { url, attempt, status: res.status, body: text.slice(0, 200) });

      // 4xx client errors are not retryable — endpoint is broken, don't waste retries
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Webhook endpoint returned ${res.status} (non-retryable)`);
      }

      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      log.warn('webhook delivery attempt failed', { url, attempt, error: String(err) });
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = 500 * Math.pow(2, attempt - 1); // 500ms, 1000ms
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export const handler = async (
  event: EventBridgeEvent<string, IntegrationEvent>,
): Promise<void> => {
  const detail = event.detail;
  const log = createLogger({
    service: 'webhook-dispatcher',
    correlationId: detail.correlationId,
    executionId: detail.correlationId,
    tenantId: detail.tenantId,
  });

  log.info('processing terminal event', { eventType: detail.eventType });

  const urlParam = `/hermes/${ENV}/tenants/${detail.tenantId}/webhookUrl`;
  const secretParam = `/hermes/${ENV}/tenants/${detail.tenantId}/webhookSecret`;

  const [webhookUrl, webhookSecret] = await Promise.all([
    getParam(urlParam),
    getParam(secretParam),
  ]);

  if (!webhookUrl) {
    log.info('no webhookUrl configured for tenant, skipping', { tenantId: detail.tenantId });
    return;
  }

  const payload = JSON.stringify({
    id: detail.eventId,
    type: detail.eventType,
    tenantId: detail.tenantId,
    executionId: detail.correlationId,
    occurredAt: detail.occurredAt,
    data: detail.payload,
    deliveredAt: new Date().toISOString(),
  });

  const secret = webhookSecret ?? 'default-webhook-secret';
  const signature = createHmac('sha256', secret).update(payload).digest('hex');

  await deliverWithRetry(webhookUrl, payload, signature, log);

  // Emit CloudWatch EMF metric
  console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: 'Hermes/Webhooks',
        Dimensions: [['tenantId', 'eventType']],
        Metrics: [{ Name: 'WebhookDelivered', Unit: 'Count' }],
      }],
    },
    tenantId: detail.tenantId,
    eventType: detail.eventType,
    WebhookDelivered: 1,
  }));
};
