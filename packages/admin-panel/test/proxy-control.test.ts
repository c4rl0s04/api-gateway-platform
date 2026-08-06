import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AdminSession } from '../lib/session.js';
import type { Environment, ProxyDeployment, RuntimeSyncStatus } from '../lib/api-client.js';
import {
  canManageOrganization,
  isPromotionEligible,
  runtimeHasApplied,
} from '../lib/proxy-control.js';

const environment = (
  stage: Environment['stage'],
  region = 'es',
): Environment => ({
  id: `env-${stage}-${region}`,
  stage,
  region,
  publicOrigin: `https://${stage}-${region}.gateway.test`,
  createdAt: '2026-08-06T00:00:00Z',
  _count: { deployments: 0, products: 0 },
});

describe('proxy control permissions and promotion', () => {
  it('limits organization writers to their memberships', () => {
    const session: AdminSession = {
      authenticated: true,
      principal: {
        memberships: [{ role: 'organizationAdmin', organizationId: 'org-a' }],
      },
    };
    assert.equal(canManageOrganization(session, 'org-a'), true);
    assert.equal(canManageOrganization(session, 'org-b'), false);
  });

  it('allows platform administrators to manage every organization', () => {
    const session: AdminSession = {
      authenticated: true,
      principal: {
        memberships: [{ role: 'platformAdmin', organizationId: null }],
      },
    };
    assert.equal(canManageOrganization(session, 'org-a'), true);
  });

  it('enforces same-revision promotion in the same region', () => {
    const deployment = {
      revision: { revisionNumber: 4 },
      environment: environment('qual'),
    } as ProxyDeployment;
    assert.equal(isPromotionEligible(environment('qual'), 4, []), true);
    assert.equal(isPromotionEligible(environment('pprod'), 4, [deployment]), true);
    assert.equal(isPromotionEligible(environment('pprod'), 5, [deployment]), false);
    assert.equal(isPromotionEligible(environment('pprod', 'us'), 4, [deployment]), false);
  });

  it('waits for every live gateway to apply the target version', () => {
    const status: RuntimeSyncStatus = {
      latestVersion: 12,
      pendingChanges: 0,
      redisAvailable: true,
      gateways: [
        { instanceId: 'a', state: 'applied', appliedVersion: 12, lastAppliedAt: null, lastError: null, synchronized: true },
        { instanceId: 'b', state: 'applied', appliedVersion: 11, lastAppliedAt: null, lastError: null, synchronized: false },
      ],
    };
    assert.equal(runtimeHasApplied(status, 12), false);
    status.gateways[1].appliedVersion = 12;
    assert.equal(runtimeHasApplied(status, 12), true);
  });
});
