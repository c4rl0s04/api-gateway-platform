import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GATEWAY_CONFIG_CHANGE_CHANNEL } from '@api-gateway/shared';
import { GatewayConfigPublisher } from '../src/runtime-sync/publisher.js';

function change(version: number) {
  return {
    version,
    changeType: 'proxyDeployment.create',
    resourceType: 'ProxyDeployment',
    resourceId: `deployment-${version}`,
    environmentId: 'env-qual-es',
    createdAt: new Date(),
    publishAttempts: 0,
    lastError: null,
  };
}

describe('gateway configuration outbox publisher', () => {
  it('publishes pending versions in order and marks them complete', async () => {
    const published: number[] = [];
    const completed: number[] = [];
    const client = {
      status: 'ready',
      on: () => undefined,
      publish: async (channel: string, message: string) => {
        assert.equal(channel, GATEWAY_CONFIG_CHANGE_CHANNEL);
        published.push(JSON.parse(message).version);
        return 1;
      },
      quit: async () => undefined,
      disconnect: () => undefined,
    };
    const publisher = new GatewayConfigPublisher({
      client,
      logger: { info: () => undefined, warn: () => undefined },
      store: {
        listPending: async () => [change(4), change(5)],
        markPublished: async version => { completed.push(version); },
        markFailed: async () => undefined,
      },
    });
    await publisher.flush();
    assert.deepEqual(published, [4, 5]);
    assert.deepEqual(completed, [4, 5]);
    await publisher.close();
  });

  it('leaves a failed version queued for a later retry', async () => {
    const failures: Array<{ version: number; error: string }> = [];
    const publisher = new GatewayConfigPublisher({
      client: {
        status: 'end',
        on: () => undefined,
        publish: async () => { throw new Error('redis unavailable'); },
        quit: async () => undefined,
        disconnect: () => undefined,
      },
      logger: { info: () => undefined, warn: () => undefined },
      store: {
        listPending: async () => [change(9), change(10)],
        markPublished: async () => undefined,
        markFailed: async (version, error) => { failures.push({ version, error }); },
      },
    });
    await publisher.flush();
    assert.deepEqual(failures, [{ version: 9, error: 'redis unavailable' }]);
    await publisher.close();
  });
});
