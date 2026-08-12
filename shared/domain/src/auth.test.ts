import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAuthContext,
  enforceTenantIsolation,
  enforceRBAC,
  TenantIsolationError,
  RBACError,
  aggregatePk,
  eventSk,
  idempotencyKey,
  DEFAULT_TENANT_ID,
} from './index.ts';

describe('Auth & RBAC tests', () => {
  describe('extractAuthContext', () => {
    test('1. JWT claims with custom:tenantId -> extracts correct tenantId', () => {
      const event = {
        requestContext: { authorizer: { jwt: { claims: { 'custom:tenantId': 'tenant-1' } } } },
      };
      const auth = extractAuthContext(event);
      assert.equal(auth.tenantId, 'tenant-1');
      assert.equal(auth.isAuthenticated, true);
    });

    test('2. JWT claims with custom:tenant_id -> works', () => {
      const event = {
        requestContext: { authorizer: { jwt: { claims: { 'custom:tenant_id': 'tenant-2' } } } },
      };
      const auth = extractAuthContext(event);
      assert.equal(auth.tenantId, 'tenant-2');
    });

    test('3. JWT claims with cognito:groups array -> maps to roles', () => {
      const event = {
        requestContext: { authorizer: { jwt: { claims: { 'cognito:groups': ['Admin', 'User'] } } } },
      };
      const auth = extractAuthContext(event);
      assert.deepEqual(auth.roles, ['Admin', 'User']);
    });

    test('4. JWT claims with custom:role string -> single-item roles array', () => {
      const event = {
        requestContext: { authorizer: { jwt: { claims: { 'custom:role': 'Service' } } } },
      };
      const auth = extractAuthContext(event);
      assert.deepEqual(auth.roles, ['Service']);
    });

    test('5. JWT claims with no groups/roles -> defaults to User', () => {
      const event = {
        requestContext: { authorizer: { jwt: { claims: {} } } },
      };
      const auth = extractAuthContext(event);
      assert.deepEqual(auth.roles, ['User']);
    });

    test('6. JWT claims with sub -> extracts userId', () => {
      const event = {
        requestContext: { authorizer: { jwt: { claims: { sub: 'user-123' } } } },
      };
      const auth = extractAuthContext(event);
      assert.equal(auth.userId, 'user-123');
    });

    test('7. No JWT claims, x-tenant-id header -> uses header tenant, isAuthenticated=false', () => {
      const event = { headers: { 'x-tenant-id': 'tenant-hdr' } };
      const auth = extractAuthContext(event);
      assert.equal(auth.tenantId, 'tenant-hdr');
      assert.equal(auth.isAuthenticated, false);
    });

    test('8. No JWT claims, x-role header -> uses header role', () => {
      const event = { headers: { 'x-role': 'Admin' } };
      const auth = extractAuthContext(event);
      assert.deepEqual(auth.roles, ['Admin']);
      assert.equal(auth.isAuthenticated, false);
    });

    test('9. No auth at all -> defaults', () => {
      const event = {};
      const auth = extractAuthContext(event);
      assert.equal(auth.tenantId, DEFAULT_TENANT_ID);
      assert.equal(auth.userId, 'dev-user');
      assert.deepEqual(auth.roles, ['Admin', 'User', 'Service']);
      assert.equal(auth.isAuthenticated, false);
    });
  });

  describe('enforceTenantIsolation', () => {
    test('10. Admin role + requestedTenantId -> returns requestedTenantId', () => {
      const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['Admin'] as any, isAuthenticated: true };
      assert.equal(enforceTenantIsolation(auth, 'tenant-2'), 'tenant-2');
    });

    test('11. Non-admin + same tenant -> returns own tenantId', () => {
      const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
      assert.equal(enforceTenantIsolation(auth, 'tenant-1'), 'tenant-1');
    });

    test('12. Non-admin + different tenant -> throws TenantIsolationError', () => {
      const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
      assert.throws(
        () => enforceTenantIsolation(auth, 'tenant-2'),
        TenantIsolationError
      );
    });

    test('13. No requestedTenantId -> returns auth.tenantId', () => {
      const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
      assert.equal(enforceTenantIsolation(auth), 'tenant-1');
    });
  });

  describe('enforceRBAC', () => {
    test('14. Admin bypasses all role checks', () => {
      const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['Admin'] as any, isAuthenticated: true };
      // Should not throw
      enforceRBAC(auth, 'Service');
      assert.ok(true);
    });

    test('15. User with required role -> passes (no throw)', () => {
      const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['Service'] as any, isAuthenticated: true };
      enforceRBAC(auth, 'Service');
      assert.ok(true);
    });

    test('16. User without required role -> throws RBACError', () => {
      const auth = { tenantId: 'tenant-1', userId: 'u1', roles: ['User'] as any, isAuthenticated: true };
      assert.throws(
        () => enforceRBAC(auth, 'Service'),
        RBACError
      );
    });
  });

  describe('Utility functions', () => {
    test('17. aggregatePk', () => {
      assert.equal(aggregatePk('WorkflowExecution', 'id-1'), 'AGG#WorkflowExecution#id-1');
    });

    test('18. eventSk', () => {
      assert.equal(eventSk(1, 'evt-1'), 'EVT#0000000001#evt-1');
    });

    test('19. idempotencyKey', () => {
      assert.equal(idempotencyKey('exec-1', 'validate'), 'exec-1#validate');
    });
  });
});
