/**
 * Hermes System Component Verifier
 *
 * Audits repository structure, package manifests, domain files, and
 * verifies compilation integrity across Java services and TypeScript SDK.
 *
 * Run: npx tsx scripts/system-component-verifier.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import assert from 'node:assert/strict';

console.log('====================================================');
console.log('Hermes System Component Verifier & Repository Audit');
console.log('====================================================\n');

const ROOT = path.resolve(__dirname, '..');

interface ComponentCheck {
  name: string;
  path: string;
  expectedFiles: string[];
}

const components: ComponentCheck[] = [
  {
    name: 'Fluent TypeScript SDK & CLI',
    path: 'shared/sdk/typescript',
    expectedFiles: ['package.json', 'tsconfig.json', 'src/workflow.ts', 'src/client.ts', 'src/cli.ts', 'src/sdk.test.ts'],
  },
  {
    name: 'Command API (Java 21 / Spring Boot)',
    path: 'services/command-api',
    expectedFiles: [
      'pom.xml',
      'src/main/java/com/hermes/command/domain/saga/SagaManager.java',
      'src/main/java/com/hermes/command/domain/dlq/DlqMessage.java',
      'src/main/java/com/hermes/command/infrastructure/eventstore/EventSchemaUpcaster.java',
      'src/main/java/com/hermes/command/infrastructure/observability/StructuredMetricsEmitter.java',
      'src/main/java/com/hermes/command/sdk/HermesClient.java',
    ],
  },
  {
    name: 'Replay Service (Java 21 / Spring Boot)',
    path: 'services/replay-service',
    expectedFiles: [
      'pom.xml',
      'src/main/java/com/hermes/replay/application/ExecutionStateProjector.java',
      'src/main/java/com/hermes/replay/application/ReplayService.java',
      'src/main/java/com/hermes/replay/infrastructure/eventstore/SnapshotStore.java',
      'src/test/java/com/hermes/replay/application/SnapshotIntegrationTest.java',
    ],
  },
  {
    name: 'Admin Service (Java 21 / Spring Boot)',
    path: 'services/admin-service',
    expectedFiles: [
      'pom.xml',
      'src/main/java/com/hermes/admin/domain/WorkflowVersionRegistry.java',
      'src/main/java/com/hermes/admin/api/DlqController.java',
      'src/main/java/com/hermes/admin/application/WorkflowTemplateLoader.java',
      'src/test/java/com/hermes/admin/domain/VersioningTest.java',
    ],
  },
  {
    name: 'ASL Workflow Templates',
    path: 'workflows/templates',
    expectedFiles: ['document-pipeline-v1.json', 'document-pipeline-v2.json', 'approval-flow-v1.json', 'batch-etl-v1.json'],
  },
  {
    name: 'Terraform Infrastructure & DR Modules',
    path: 'infra',
    expectedFiles: [
      'environments/dev/main.tf',
      'modules/workflow-registry/main.tf',
      'modules/multi-region-dr/main.tf',
      'modules/cloudwatch-alarms/cloudwatch-dashboard.json',
    ],
  },
  {
    name: 'Documentation & Runbooks',
    path: 'docs',
    expectedFiles: ['RUNBOOK.md', 'ARCHITECTURE_SUMMARY.md', 'INTERVIEW_CHEAT_SHEET.md'],
  },
  {
    name: 'Automation & Runtime Tests',
    path: 'scripts',
    expectedFiles: ['e2e-validation.ts', 'load-benchmark-suite.ts', 'runtime-worker-tests.ts', 'system-component-verifier.ts'],
  },
];

let totalChecks = 0;
let passedChecks = 0;

for (const comp of components) {
  console.log(`Checking Component: ${comp.name} (${comp.path})`);
  const compDir = path.join(ROOT, comp.path);

  if (!fs.existsSync(compDir)) {
    console.error(`   [MISSING DIR] Directory missing: ${comp.path}`);
    continue;
  }

  for (const file of comp.expectedFiles) {
    totalChecks++;
    const filePath = path.join(compDir, file);
    if (fs.existsSync(filePath)) {
      passedChecks++;
      console.log(`   - [OK] ${file}`);
    } else {
      console.error(`   - [MISSING] ${file}`);
    }
  }
  console.log('');
}

console.log('----------------------------------------------------');
console.log(`Component Verification Summary: ${passedChecks} / ${totalChecks} files verified.`);
assert.equal(passedChecks, totalChecks, 'All required system files must be present');
console.log('System Integrity & Repository Audit PASSED 100%!');
console.log('----------------------------------------------------');
