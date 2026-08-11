#!/usr/bin/env node

/**
 * Hermes CLI  Developer and Operator Command-Line Interface
 *
 * Usage:
 *   hermes workflow register <file.json> --url <commandApiUrl> --tenant <tenantId> --token <token>
 *   hermes execution start --workflow <name> --version <v> --asset <assetId> --url <commandApiUrl> --tenant <tenantId> --token <token>
 *   hermes execution status <executionId> --url <commandApiUrl> --tenant <tenantId> --token <token>
 *   hermes dlq list --url <adminApiUrl> --token <token>
 *   hermes replay trigger <executionId> --from-step <step> --url <replayApiUrl> --tenant <tenantId> --token <token>
 */

import { parseArgs } from 'node:util';
import { HermesClient } from './client.js';
import { WorkflowBuilder } from './workflow.js';
import * as fs from 'node:fs';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  const subcommand = args[1];

  try {
    if (command === 'workflow' && subcommand === 'register') {
      await handleWorkflowRegister(args.slice(2));
    } else if (command === 'execution' && subcommand === 'start') {
      await handleExecutionStart(args.slice(2));
    } else if (command === 'execution' && subcommand === 'status') {
      await handleExecutionStatus(args.slice(2));
    } else if (command === 'dlq' && subcommand === 'list') {
      await handleDlqList(args.slice(2));
    } else if (command === 'replay' && subcommand === 'trigger') {
      await handleReplayTrigger(args.slice(2));
    } else {
      console.error(`Unknown command: ${command} ${subcommand || ''}`);
      printHelp();
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Hermes CLI  Workflow Platform Command Line Tool

Commands:
  workflow register <file.json>  Register a workflow definition (JSON or ASL)
  execution start                Submit an asset for workflow execution
  execution status <id>          Get status of a workflow execution
  dlq list                       Inspect Dead-Letter Queue messages
  replay trigger <id>            Trigger a time-travel replay for an execution

Global Options:
  --url <url>      API Base URL
  --tenant <id>    Tenant ID
  --token <token>  Cognito Bearer token
`);
}

async function handleWorkflowRegister(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      tenant: { type: 'string' },
      token: { type: 'string' },
      name: { type: 'string' },
      version: { type: 'string' },
    },
    allowPositionals: true,
  });

  const filePath = positionals[0];
  if (!filePath) throw new Error('File path required: hermes workflow register <file.json>');

  const content = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);

  const client = new HermesClient({
    commandApiUrl: values.url || 'http://localhost:8080',
    replayApiUrl: values.url || 'http://localhost:8082',
    tenantId: values.tenant || 'tenant-dev',
    accessToken: values.token || 'dev-token',
  });

  const res = await client.registerWorkflow({
    name: values.name || json.name || 'document-pipeline',
    version: values.version ? parseInt(values.version, 10) : (json.version || 1),
    asl: json.asl || json,
  });

  console.log(`[SUCCESS] Workflow registered successfully: ${res.workflowName} v${res.version}`);
}

async function handleExecutionStart(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      tenant: { type: 'string' },
      token: { type: 'string' },
      workflow: { type: 'string' },
      version: { type: 'string' },
      asset: { type: 'string' },
      idempotencyKey: { type: 'string' },
    },
  });

  if (!values.workflow) throw new Error('--workflow <name> is required');
  if (!values.asset) throw new Error('--asset <assetId> is required');

  const client = new HermesClient({
    commandApiUrl: values.url || 'http://localhost:8080',
    replayApiUrl: values.url || 'http://localhost:8082',
    tenantId: values.tenant || 'tenant-dev',
    accessToken: values.token || 'dev-token',
  });

  const res = await client.startExecution({
    tenantId: values.tenant || 'tenant-dev',
    workflowName: values.workflow,
    workflowVersion: values.version ? parseInt(values.version, 10) : 1,
    assetId: values.asset,
    idempotencyKey: values.idempotencyKey,
  });

  console.log(`[STARTED] Execution started: ${res.executionId} (Status: ${res.status})`);
}

async function handleExecutionStatus(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      tenant: { type: 'string' },
      token: { type: 'string' },
    },
    allowPositionals: true,
  });

  const executionId = positionals[0];
  if (!executionId) throw new Error('Execution ID required: hermes execution status <executionId>');

  const client = new HermesClient({
    commandApiUrl: values.url || 'http://localhost:8080',
    replayApiUrl: values.url || 'http://localhost:8082',
    tenantId: values.tenant || 'tenant-dev',
    accessToken: values.token || 'dev-token',
  });

  const res = await client.getExecutionStatus(executionId);
  console.log(`[STATUS] Execution Status: ${res.executionId}`);
  console.log(`   Workflow: ${res.workflowName} v${res.workflowVersion}`);
  console.log(`   Status:   ${res.status}`);
  console.log(`   Started:  ${res.startedAt}`);
}

async function handleDlqList(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      token: { type: 'string' },
      max: { type: 'string' },
    },
  });

  const url = (values.url || 'http://localhost:8081') + '/api/v1/dlq?maxMessages=' + (values.max || '10');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${values.token || 'dev-token'}` },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json() as any;

  console.log(`[DLQ] Depth / Messages (Total: ${data.totalCount}, Poison: ${data.poisonCount})`);
  for (const msg of data.messages || []) {
    console.log(`  - [${msg.severity}] ${msg.messageId} | Event: ${msg.eventType} | Reason: ${msg.failureReason}`);
  }
}

async function handleReplayTrigger(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      tenant: { type: 'string' },
      token: { type: 'string' },
      'from-step': { type: 'string' },
      reason: { type: 'string' },
    },
    allowPositionals: true,
  });

  const executionId = positionals[0];
  if (!executionId) throw new Error('Execution ID required: hermes replay trigger <executionId>');

  const client = new HermesClient({
    commandApiUrl: values.url || 'http://localhost:8080',
    replayApiUrl: values.url || 'http://localhost:8082',
    tenantId: values.tenant || 'tenant-dev',
    accessToken: values.token || 'dev-token',
  });

  const res = await client.replayExecution({
    executionId,
    fromStep: values['from-step'],
    reason: values.reason || 'CLI trigger',
  });

  console.log(`[REPLAY] Replay Job Triggered: ${res.replayJobId}`);
  console.log(`   Status:         ${res.status}`);
  console.log(`   Events Replayed:${res.eventsReplayed}`);
  console.log(`   Steps Skipped:  ${res.stepsSkipped}`);
}

main();
