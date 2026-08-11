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
} from './index';

describe('Domain Utility Functions', () => {
  test('aggregatePk formats correctly', () => {
    assert.equal(aggregatePk('WorkflowExecution', 'exec-123'), 'AGG#WorkflowExecution#exec-123');
    assert.equal(aggregatePk('Asset', 'asset-456'), 'AGG#Asset#asset-456');
  });

  test('eventSk formats sequence numbers with 10-digit zero padding', () => {
    assert.equal(eventSk(1, 'evt-1'), 'EVT#0000000001#evt-1');
    assert.equal(eventSk(42, 'evt-42'), 'EVT#0000000042#evt-42');
  });

  test('idempotencyKey combines executionId and stepName', () => {
    assert.equal(idempotencyKey('exec-100', 'validate'), 'exec-100#validate');
  });
});

describe('Phase 7 AuthContext & Extraction', () => {
  test('extracts JWT claims when present in APIGateway event', () => {
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

  test('falls back to header values or default tenant when unauthenticated', () => {
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

  test('allows Admin role to access another tenant', () => {
    const auth = { tenantId: 'tenant-admin', userId: 'admin1', roles: ['Admin'] as any, isAuthenticated: true };
    const effective = enforceTenantIsolation(auth, 'tenant-target');
    assert.equal(effective, 'tenant-target');
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

  test('bypasses check for Admin role', () => {
    const auth = { tenantId: 't1', userId: 'admin1', roles: ['Admin'] as any, isAuthenticated: true };
    assert.doesNotThrow(() => enforceRBAC(auth, 'Service'));
    assert.doesNotThrow(() => enforceRBAC(auth, 'User'));
  });
});
