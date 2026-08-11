import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  RegisterAssetCommand,
  RecordStepResultCommand,
  extractAuthContext,
  enforceTenantIsolation,
  enforceRBAC,
  TenantIsolationError,
  RBACError,
} from '@hermes/domain';
import { DynamoEventStore, EventBridgePublisher } from '@hermes/event-store';
import { handleRegisterAsset, handleRecordStepResult } from '@hermes/command-handlers';
import { createLogger } from '@hermes/observability';

const eventStore = new DynamoEventStore(process.env.EVENT_STORE_TABLE!);
const publisher = new EventBridgePublisher(process.env.EVENT_BUS_NAME!, 'hermes.command-api');
const sfn = new SFNClient({});

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = extractAuthContext(event);
  const log = createLogger({
    service: 'command-api',
    correlationId: randomUUID(),
    tenantId: auth.tenantId,
    userId: auth.userId,
  });

  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    // -----------------------------------------------------------------
    // 1. POST /assets (RegisterAsset command)
    // -----------------------------------------------------------------
    if (method === 'POST' && path === '/assets') {
      // User or Admin role required
      enforceRBAC(auth, 'User');

      const body = JSON.parse(event.body ?? '{}');
      const effectiveTenantId = enforceTenantIsolation(auth, body.tenantId);

      const command: RegisterAssetCommand = {
        commandType: 'RegisterAsset',
        tenantId: effectiveTenantId,
        assetId: body.assetId ?? randomUUID(),
        s3Key: body.s3Key,
        contentType: body.contentType ?? 'application/octet-stream',
        workflowName: body.workflowName,
        workflowVersion: body.workflowVersion,
        clientRequestId: body.clientRequestId,
      };

      if (!command.s3Key) {
        return json(400, { error: 's3Key is required' });
      }

      const result = await handleRegisterAsset(command, { eventStore, publisher });
      log.info('RegisterAsset command accepted', {
        executionId: result.executionId,
        tenantId: command.tenantId,
        roles: auth.roles,
      });

      return json(202, result);
    }

    // -----------------------------------------------------------------
    // 2. POST /step-results (RecordStepResult command)
    // -----------------------------------------------------------------
    if (method === 'POST' && path === '/step-results') {
      // Service or Admin role required
      enforceRBAC(auth, 'Service');

      const body = JSON.parse(event.body ?? '{}');
      const effectiveTenantId = enforceTenantIsolation(auth, body.tenantId);

      const command: RecordStepResultCommand = {
        commandType: 'RecordStepResult',
        tenantId: effectiveTenantId,
        executionId: body.executionId,
        stepName: body.stepName,
        status: body.status ?? 'completed',
        output: body.output,
        error: body.error,
        retryable: body.retryable,
      };

      if (!command.executionId || !command.stepName) {
        return json(400, { error: 'executionId and stepName are required' });
      }

      const result = await handleRecordStepResult(command, { eventStore, publisher });
      log.info('RecordStepResult command accepted', {
        executionId: command.executionId,
        tenantId: command.tenantId,
        stepName: command.stepName,
      });

      return json(202, result);
    }

    return json(404, { error: 'not found' });
  } catch (err) {
    if (err instanceof TenantIsolationError || err instanceof RBACError) {
      log.warn('authorization check failed', { error: err.message });
      return json(403, { error: err.message });
    }

    log.error('command execution failed', err);
    return json(500, { error: 'internal error' });
  }
}
