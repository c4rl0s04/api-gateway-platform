import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RuntimeSyncService } from '../src/services/runtime-sync.js';

describe('gateway runtime synchronization status', () => {
  it('compares live gateway versions with the committed configuration', async () => {
    const service = new RuntimeSyncService({
      status: 'end',
      on: () => undefined,
      scan: async () => ['0', ['gateway:runtime:v1:gateway-a']],
      mget: async () => [JSON.stringify({
        instanceId: 'gateway-a',
        state: 'applied',
        appliedVersion: 14,
        lastAppliedAt: new Date().toISOString(),
        lastError: null,
      })],
      quit: async () => undefined,
      disconnect: () => undefined,
    }, {
      latestVersion: async () => 15,
      pendingCount: async () => 1,
    });
    const result = await service.getStatus({} as never) as {
      latestVersion: number;
      pendingChanges: number;
      gateways: Array<{ synchronized: boolean }>;
    };
    assert.equal(result.latestVersion, 15);
    assert.equal(result.pendingChanges, 1);
    assert.equal(result.gateways[0].synchronized, false);
  });

  it('keeps database status available when Redis cannot be read', async () => {
    const service = new RuntimeSyncService({
      status: 'end',
      on: () => undefined,
      scan: async () => { throw new Error('redis unavailable'); },
      mget: async () => [],
      quit: async () => undefined,
      disconnect: () => undefined,
    }, {
      latestVersion: async () => 8,
      pendingCount: async () => 2,
    });
    const result = await service.getStatus({} as never) as {
      redisAvailable: boolean;
      gateways: unknown[];
    };
    assert.equal(result.redisAvailable, false);
    assert.deepEqual(result.gateways, []);
  });
});
