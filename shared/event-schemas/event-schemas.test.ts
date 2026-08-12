import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_SCHEMAS = [
  'StepCompleted.v1.json',
  'WorkflowExecutionStarted.v1.json',
  'WorkflowExecutionStarted.v2.json',
  'WorkflowExecutionStarted.v3.json',
];

function validatePayload(schema: any, payload: any): boolean {
  const targetSchema = schema.properties?.payload || schema;
  if (!targetSchema.properties) return true;
  
  if (targetSchema.required) {
    for (const req of targetSchema.required) {
      if (payload[req] === undefined) {
        return false;
      }
    }
  }
  
  for (const [key, value] of Object.entries(payload)) {
    const propDef = targetSchema.properties[key];
    if (propDef) {
      if (propDef.type === 'string' && typeof value !== 'string') return false;
      if ((propDef.type === 'number' || propDef.type === 'integer') && typeof value !== 'number') return false;
      if (propDef.type === 'boolean' && typeof value !== 'boolean') return false;
    }
  }
  
  return true;
}

describe('Event JSON Schemas', () => {
  const schemasDir = fs.existsSync(path.join(__dirname, 'WorkflowExecutionStarted.v1.json'))
    ? __dirname
    : path.join(process.cwd(), 'shared', 'event-schemas');
  const loadedSchemas: Record<string, any> = {};

  test('all event schema files exist, are valid JSON, and parseable', () => {
    for (const file of EXPECTED_SCHEMAS) {
      const filePath = path.join(schemasDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const schema = JSON.parse(content);
        loadedSchemas[file] = schema;
        assert.ok(schema, `Failed to parse ${file}`);
      } catch (err) {
        assert.fail(`Error processing ${file}: ${err}`);
      }
    }
    assert.equal(Object.keys(loadedSchemas).length, EXPECTED_SCHEMAS.length);
  });

  test('each schema defines type: "object" and $schema', () => {
    for (const [file, schema] of Object.entries(loadedSchemas)) {
      assert.equal(schema.type, 'object', `${file} should have type: "object"`);
      assert.ok(schema.$schema, `${file} should have $schema defined`);
    }
  });

  test('WorkflowExecutionStarted.v1 schema requires executionId and workflowName', () => {
    const schema = loadedSchemas['WorkflowExecutionStarted.v1.json'];
    assert.ok(schema);
    const required = schema.properties.payload.required || [];
    assert.ok(required.includes('executionId'));
    assert.ok(required.includes('workflowName'));
  });

  describe('payload validation logic', () => {
    test('WorkflowExecutionStarted.v1 - valid payload', () => {
      const schema = loadedSchemas['WorkflowExecutionStarted.v1.json'];
      const payload = {
        executionId: 'exec-123',
        workflowName: 'TestWorkflow',
        workflowVersion: 1,
        assetId: 'asset-123',
        s3Key: 'file.pdf'
      };
      
      assert.equal(validatePayload(schema, payload), true);
    });
    
    test('WorkflowExecutionStarted.v1 - missing executionId', () => {
      const schema = loadedSchemas['WorkflowExecutionStarted.v1.json'];
      const payload = {
        workflowName: 'TestWorkflow',
        workflowVersion: 1,
        assetId: 'asset-123',
        s3Key: 'file.pdf'
      };
      
      assert.equal(validatePayload(schema, payload), false);
    });

    test('StepCompleted.v1 - valid payload', () => {
      const schema = loadedSchemas['StepCompleted.v1.json'];
      const payload = {
        executionId: 'exec-123',
        stepName: 'validate',
        output: { valid: true }
      };
      
      assert.equal(validatePayload(schema, payload), true);
    });
  });
});
