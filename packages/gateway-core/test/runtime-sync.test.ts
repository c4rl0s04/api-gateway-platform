import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GatewayRuntimeStatus, ProxyConfig } from '@api-gateway/shared';
import { GatewayConfigReloader } from '../src/runtime-sync/reloader.js';

const snapshot = [{ id: 'proxy-1' }] as ProxyConfig[];

describe('gateway configuration reloader', () => {
  it('serializes notifications and applies the highest requested version', async () => {
    let releaseLoad: (() => void) | undefined;
    let loads = 0;
    const applied: number[] = [];
    const statuses: GatewayRuntimeStatus[] = [];
    const reloader = new GatewayConfigReloader({
      instanceId: 'gateway-a',
      initialVersion: 1,
      loadSnapshot: async () => {
        loads += 1;
        if (loads === 1) await new Promise<void>(resolve => { releaseLoad = resolve; });
        return snapshot;
      },
      applySnapshot: () => applied.push(loads),
      publishStatus: async status => { statuses.push(status); },
    });

    const first = reloader.requestReload(2);
    await new Promise(resolve => setImmediate(resolve));
    const latest = reloader.requestReload(4);
    releaseLoad?.();
    await Promise.all([first, latest]);

    assert.equal(loads, 2);
    assert.deepEqual(applied, [1, 2]);
    assert.equal(reloader.status().appliedVersion, 4);
    assert.equal(reloader.status().state, 'applied');
    assert.ok(statuses.some(status => status.state === 'loading'));
  });

  it('keeps the applied version and exposes an invalid snapshot error', async () => {
    const statuses: GatewayRuntimeStatus[] = [];
    const reloader = new GatewayConfigReloader({
      instanceId: 'gateway-a',
      initialVersion: 7,
      loadSnapshot: async () => snapshot,
      applySnapshot: () => { throw new Error('duplicate base path'); },
      publishStatus: async status => { statuses.push(status); },
    });

    await reloader.requestReload(8);

    assert.equal(reloader.status().appliedVersion, 7);
    assert.equal(reloader.status().state, 'error');
    assert.equal(reloader.status().lastError, 'duplicate base path');
    assert.equal(statuses.at(-1)?.state, 'error');
  });

  it('converges separate instances through periodic reconciliation', async () => {
    let latestVersion = 3;
    const create = (instanceId: string) => new GatewayConfigReloader({
      instanceId,
      initialVersion: 1,
      loadSnapshot: async () => snapshot,
      applySnapshot: () => undefined,
      getLatestVersion: async () => latestVersion,
    });
    const first = create('gateway-a');
    const second = create('gateway-b');

    await Promise.all([first.reconcile(), second.reconcile()]);
    latestVersion = 5;
    await Promise.all([first.reconcile(), second.reconcile()]);

    assert.equal(first.status().appliedVersion, 5);
    assert.equal(second.status().appliedVersion, 5);
  });
});
