import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  AgentOperations,
  IdentityStore,
  startLocalAgent,
  type MasterKeyProvider,
  type RunningAgent,
} from '../src/index.js';

class TestMasterKeyProvider implements MasterKeyProvider {
  async getOrCreate(): Promise<Buffer> {
    return Buffer.alloc(32, 3);
  }
}

const resources: Array<{ directory: string; agent?: RunningAgent }> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.agent?.close();
    await rm(resource.directory, { recursive: true, force: true });
  }
});

describe('gatewayctl loopback pairing', () => {
  it('exposes protocol and capability metadata without runtime secrets', async () => {
    const { agent, baseUrl } = await fixture();
    const response = await fetch(`${baseUrl}/v1/status`, {
      headers: { origin: 'http://localhost:8080' },
    });
    assert.equal(response.status, 200);
    const status = await response.json() as Record<string, unknown>;
    assert.equal(status.protocolVersion, 2);
    assert.equal(status.instanceId, agent.instanceId);
    assert.ok(Array.isArray(status.capabilities));
    assert.equal('pid' in status, false);
    assert.equal('stateDirectory' in status, false);
  });
  it('uses a single-use nonce and origin-bound temporary session', async () => {
    const { agent, baseUrl } = await fixture();
    const paired = await fetch(`${baseUrl}/pair`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:8080',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ nonce: agent.pairingNonce }),
    });
    assert.equal(paired.status, 200);
    const session = await paired.json() as { token: string };

    const reused = await fetch(`${baseUrl}/pair`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:8080',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ nonce: agent.pairingNonce }),
    });
    assert.equal(reused.status, 400);
    assert.equal((await reused.json() as { error: { code: string } }).error.code, 'pairing_rejected');

    const status = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:8080',
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ method: 'agent.status' }),
    });
    assert.equal(status.status, 200);
    assert.equal(
      (await status.json() as { result: { connected: boolean } }).result.connected,
      true,
    );

    const wrongOrigin = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ method: 'agent.status' }),
    });
    assert.equal(wrongOrigin.status, 403);
  });

  it('answers Private Network Access preflights without exposing extra routes', async () => {
    const { baseUrl } = await fixture();
    const preflight = await fetch(`${baseUrl}/rpc`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:8080',
        'access-control-request-private-network': 'true',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');

    const forbiddenRoute = await fetch(`${baseUrl}/filesystem`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:8080',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(forbiddenRoute.status, 404);
  });
});

async function fixture(): Promise<{ agent: RunningAgent; baseUrl: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-agent-test-'));
  const profile = {
    allowedOrigins: ['http://localhost:8080'],
    allowedAudienceHosts: ['*.gateway.localhost'],
    playgroundUrl: 'http://localhost:8080/playground',
    port: 43_127,
    trustedClientDays: 30,
  };
  const store = new IdentityStore(new TestMasterKeyProvider(), directory);
  const agent = await startLocalAgent({
    operations: new AgentOperations(store, profile),
    profile,
    stateDirectory: directory,
  });
  resources.push({ directory, agent });
  return { agent, baseUrl: `http://127.0.0.1:${agent.port}` };
}
