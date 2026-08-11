/**
 * Hermes HTTP Client
 *
 * Thin HTTP wrapper for the Hermes Command API and Replay Service.
 * Zero external dependencies  uses Node.js built-in `fetch` (Node 18+).
 *
 * Authentication: passes a Bearer token (from Cognito) on every request.
 * All responses are strongly-typed against the Hermes API contract.
 *
 * @example
 * ```typescript
 * const client = new HermesClient({
 *   commandApiUrl: 'https://api.hermes.internal/command',
 *   replayApiUrl:  'https://api.hermes.internal/replay',
 *   tenantId:      'tenant-acme',
 *   accessToken:   await getCognitoToken(),
 * });
 *
 * const exec = await client.startExecution({
 *   tenantId: 'tenant-acme',
 *   assetId: 'asset-001',
 *   workflowName: 'document-pipeline',
 *   workflowVersion: 2,
 *   idempotencyKey: 'invoice-batch-2026-08',
 * });
 *
 * const status = await client.getExecutionStatus(exec.executionId);
 * ```
 */

import type {
  HermesExecutionInput,
  HermesExecutionStatus,
  HermesWorkflowDefinition,
  ReplayRequest,
  ReplayResponse,
} from './types.js';

//  Config 

export interface HermesClientConfig {
  /** Base URL of the Hermes Command API (e.g. https://api.hermes.internal/command). */
  readonly commandApiUrl: string;
  /** Base URL of the Hermes Replay Service (e.g. https://api.hermes.internal/replay). */
  readonly replayApiUrl: string;
  /** Tenant identifier  injected as X-Tenant-ID on every request. */
  readonly tenantId: string;
  /** Cognito access token. Rotated externally; client uses it as-is. */
  readonly accessToken: string;
  /** Optional: override the default 30s request timeout. */
  readonly timeoutMs?: number;
}

//  Response types (API contract) 

interface StartExecutionResponse {
  executionId: string;
  tenantId: string;
  workflowName: string;
  workflowVersion: number;
  assetId: string;
  status: string;
  message: string;
}

interface RegisterWorkflowResponse {
  workflowName: string;
  version: number;
  registered: boolean;
  message: string;
}

//  Error 

export class HermesApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly endpoint: string,
    message: string,
  ) {
    super(`[Hermes API] ${statusCode} ${endpoint}: ${message}`);
    this.name = 'HermesApiError';
  }
}

//  Client 

export class HermesClient {
  private readonly config: HermesClientConfig;

  constructor(config: HermesClientConfig) {
    if (!config.commandApiUrl) throw new Error('HermesClient: commandApiUrl is required');
    if (!config.replayApiUrl) throw new Error('HermesClient: replayApiUrl is required');
    if (!config.tenantId) throw new Error('HermesClient: tenantId is required');
    if (!config.accessToken) throw new Error('HermesClient: accessToken is required');
    this.config = config;
  }

  //  Workflow Registration 

  /**
   * Registers a compiled workflow definition with the Hermes admin service.
   * Idempotent: re-registering the same version is a no-op.
   *
   * @param definition compiled workflow (from WorkflowBuilder.compileToASL())
   */
  async registerWorkflow(definition: HermesWorkflowDefinition): Promise<RegisterWorkflowResponse> {
    return this.post<RegisterWorkflowResponse>(
      `${this.config.commandApiUrl}/workflows`,
      {
        name: definition.name,
        version: definition.version,
        asl: definition.asl,
        compensation: definition.compensation,
      },
    );
  }

  //  Execution 

  /**
   * Submits an asset for workflow execution.
   *
   * @param input execution parameters (assetId, workflow name/version, idempotency key)
   * @returns the created execution record with executionId
   */
  async startExecution(input: HermesExecutionInput): Promise<StartExecutionResponse> {
    return this.post<StartExecutionResponse>(
      `${this.config.commandApiUrl}/executions`,
      input,
    );
  }

  /**
   * Retrieves the current status of a workflow execution, including
   * per-step status, outputs, and timing.
   *
   * @param executionId the execution to query
   */
  async getExecutionStatus(executionId: string): Promise<HermesExecutionStatus> {
    return this.get<HermesExecutionStatus>(
      `${this.config.commandApiUrl}/executions/${executionId}`,
    );
  }

  /**
   * Polls for execution completion up to {@code maxWaitMs}, checking
   * every {@code pollIntervalMs}. Returns the final status once
   * COMPLETED or FAILED is reached.
   *
   * @param executionId   the execution to wait on
   * @param maxWaitMs     maximum wait time in ms (default: 5 minutes)
   * @param pollIntervalMs polling frequency in ms (default: 2000ms)
   */
  async waitForCompletion(
    executionId: string,
    maxWaitMs = 300_000,
    pollIntervalMs = 2000,
  ): Promise<HermesExecutionStatus> {
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const status = await this.getExecutionStatus(executionId);
      if (status.status === 'COMPLETED' || status.status === 'FAILED') {
        return status;
      }
      await sleep(pollIntervalMs);
    }

    throw new Error(
      `[HermesClient] Execution ${executionId} did not complete within ${maxWaitMs}ms`,
    );
  }

  //  Replay 

  /**
   * Triggers a replay of a past workflow execution.
   *
   * Supports all replay modes:
   * - Full replay (no `fromStep`/`replayToSequence`/`replayToTimestamp`)
   * - From-step replay (`fromStep`)
   * - Point-in-time by sequence (`replayToSequence`)
   * - Point-in-time by timestamp (`replayToTimestamp`)
   *
   * @param request replay parameters
   */
  async replayExecution(request: ReplayRequest): Promise<ReplayResponse> {
    return this.post<ReplayResponse>(
      `${this.config.replayApiUrl}/replay`,
      request,
    );
  }

  //  HTTP helpers 

  private async post<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
    });
    return this.parseResponse<T>(response, url);
  }

  private async get<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
    });
    return this.parseResponse<T>(response, url);
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.accessToken}`,
      'X-Tenant-ID': this.config.tenantId,
    };
  }

  private async parseResponse<T>(response: Response, url: string): Promise<T> {
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.json() as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        // swallow JSON parse error; use statusText
      }
      throw new HermesApiError(response.status, url, message);
    }
    return response.json() as Promise<T>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
