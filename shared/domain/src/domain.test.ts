import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregatePk,
  eventSk,
  idempotencyKey,
  extractAuthContext,
  enforceTenantIsolation,
  enforceRBAC,
  TenantIsolationError,
  RBACError,
  DEFAULT_TENANT_ID,
  EventTypes,
  AggregateTypes,
} from './index';

describe('Domain Utility Functions & Key Generators', () => {
  test('aggregatePk formats partition keys correctly for all aggregate types', () => {
    assert.equal(aggregatePk('WorkflowExecution', 'exec-123'), 'AGG#WorkflowExecution#exec-123');
    assert.equal(aggregatePk('Asset', 'asset-456'), 'AGG#Asset#asset-456');
    assert.equal(aggregatePk('Tenant', 'tenant-789'), 'AGG#Tenant#tenant-789');
  });

  test('eventSk formats sequence numbers with strict 10-digit zero padding', () => {
    assert.equal(eventSk(1, 'evt-1'), 'EVT#0000000001#evt-1');
    assert.equal(eventSk(42, 'evt-42'), 'EVT#0000000042#evt-42');
    assert.equal(eventSk(99999, 'evt-99'), 'EVT#0000099999#evt-99');
  });

  test('idempotencyKey combines executionId and stepName for deduplication', () => {
    assert.equal(idempotencyKey('exec-100', 'validate'), 'exec-100#validate');
    assert.equal(idempotencyKey('exec-200', 'ocr'), 'exec-200#ocr');
  });

  test('EventTypes constants contain all 12 domain event types', () => {
    assert.equal(EventTypes.AssetRegistered, 'AssetRegistered');
    assert.equal(EventTypes.WorkflowExecutionStarted, 'WorkflowExecutionStarted');
    assert.equal(EventTypes.StepCompleted, 'StepCompleted');
    assert.equal(EventTypes.StepFailed, 'StepFailed');
    assert.equal(EventTypes.WorkflowExecutionCompleted, 'WorkflowExecutionCompleted');
    assert.equal(EventTypes.WorkflowExecutionFailed, 'WorkflowExecutionFailed');
    assert.equal(EventTypes.RetryScheduled, 'RetryScheduled');
    assert.equal(EventTypes.SnapshotCreated, 'SnapshotCreated');
    assert.equal(EventTypes.WebhookDelivered, 'WebhookDelivered');
    assert.equal(EventTypes.NotificationSent, 'NotificationSent');
    assert.equal(EventTypes.ExecutionCancelled, 'ExecutionCancelled');
    assert.equal(EventTypes.ExecutionTimedOut, 'ExecutionTimedOut');
  });
});

describe('Phase 7 AuthContext & JWT Claim Extraction', () => {
  test('extracts JWT claims when present in APIGateway HTTP event', () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              'custom:tenantId': 'tenant-acme',
              sub: 'user-789',
              'cognito:groups': ['Admin', 'User'],
            },
          },
        },
      },
    };

    const auth = extractAuthContext(mockEvent);
    assert.equal(auth.tenantId, 'tenant-acme');
    assert.equal(auth.userId, 'user-789');
    assert.deepEqual(auth.roles, ['Admin', 'User']);
    assert.equal(auth.isAuthenticated, true);
  });

  test('extracts single group string in JWT claims', () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              tenantId: 'tenant-single',
              username: 'user-single',
              'cognito:groups': 'User',
            },
          },
        },
      },
    };

    const auth = extractAuthContext(mockEvent);
    assert.equal(auth.tenantId, 'tenant-single');
    assert.equal(auth.userId, 'user-single');
    assert.deepEqual(auth.roles, ['User']);
  });

  test('falls back to header values or default tenant when unauthenticated in dev mode', () => {
    const mockEvent = {
      headers: {
        'x-tenant-id': 'tenant-test',
        'x-role': 'User',
      },
    };

    const auth = extractAuthContext(mockEvent);
    assert.equal(auth.tenantId, 'tenant-test');
    assert.deepEqual(auth.roles, ['User']);
    assert.equal(auth.isAuthenticated, false);
  });

  test('uses DEFAULT_TENANT_ID when no headers or claims are supplied', () => {
    const mockEvent = {};
    const auth = extractAuthContext(mockEvent);
    assert.equal(auth.tenantId, DEFAULT_TENANT_ID);
    assert.equal(auth.userId, 'dev-user');
    assert.deepEqual(auth.roles, ['Admin', 'User', 'Service']);
  });
});

describe('Tenant Isolation Enforcement', () => {
  test('allows caller to access their own tenant data', () => {
    const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
    const effective = enforceTenantIsolation(auth, 'tenant-1');
    assert.equal(effective, 'tenant-1');
  });

  test('throws TenantIsolationError when non-admin accesses another tenant', () => {
    const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
    assert.throws(
      () => enforceTenantIsolation(auth, 'tenant-2'),
      TenantIsolationError,
    );
  });

  test('allows Admin role to explicitly specify target tenant', () => {
    const auth = { tenantId: 'tenant-admin', userId: 'admin1', roles: ['Admin'] as any, isAuthenticated: true };
    const effective = enforceTenantIsolation(auth, 'tenant-target');
    assert.equal(effective, 'tenant-target');
  });

  test('returns caller tenant when no explicit target tenant is requested', () => {
    const auth = { tenantId: 'tenant-default', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
    const effective = enforceTenantIsolation(auth, undefined);
    assert.equal(effective, 'tenant-default');
  });
});

describe('RBAC Role Enforcement', () => {
  test('passes when caller has the required role', () => {
    const auth = { tenantId: 't1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
    assert.doesNotThrow(() => enforceRBAC(auth, 'User'));
  });

  test('throws RBACError when caller lacks the required role', () => {
    const auth = { tenantId: 't1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
    assert.throws(
      () => enforceRBAC(auth, 'Service'),
      RBACError,
    );
  });

  test('bypasses check for Admin role across all required roles', () => {
    const auth = { tenantId: 't1', userId: 'admin1', roles: ['Admin'] as any, isAuthenticated: true };
    assert.doesNotThrow(() => enforceRBAC(auth, 'Service'));
    assert.doesNotThrow(() => enforceRBAC(auth, 'User'));
    assert.doesNotThrow(() => enforceRBAC(auth, 'Admin'));
  });
});
