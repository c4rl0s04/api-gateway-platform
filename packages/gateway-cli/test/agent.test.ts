import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { exportJWK } from 'jose';
import {
  AgentOperations,
  IdentityStore,
  startLocalAgent,
  type MasterKeyProvider,
  type RunningAgent,
  pairingProofMessage,
  type PairingPrompt,
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
  it('pairs through a terminal code and protects versioned RPC with the browser session', async () => {
    const { agent, baseUrl, prompts } = await fixture();
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const clientId = 'browser-http-client-0001';
    const requested = await fetch(`${baseUrl}/v1/pairings`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:8080',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ clientId, label: 'HTTP test', publicJwk: await exportJWK(publicKey) }),
    });
    assert.equal(requested.status, 202);
    const pairing = await requested.json() as { pairingId: string; nonce: string };
    const signature = sign('sha256', Buffer.from(pairingProofMessage({
      pairingId: pairing.pairingId,
      nonce: pairing.nonce,
      origin: 'http://localhost:8080',
      instanceId: agent.instanceId,
      clientId,
    })), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const paired = await fetch(`${baseUrl}/v1/pairings/${pairing.pairingId}/complete`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:8080',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: prompts[0]!.code, signature }),
    });
    assert.equal(paired.status, 200);
    const session = await paired.json() as { token: string };

    const status = await fetch(`${baseUrl}/v1/rpc`, {
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

    const wrongOrigin = await fetch(`${baseUrl}/v1/rpc`, {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ method: 'agent.status' }),
    });
    assert.equal(wrongOrigin.status, 403);

    const retired = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(retired.status, 404);
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

async function fixture(): Promise<{
  agent: RunningAgent;
  baseUrl: string;
  prompts: PairingPrompt[];
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-agent-test-'));
  const profile = {
    allowedOrigins: ['http://localhost:8080'],
    allowedAudienceHosts: ['*.gateway.localhost'],
    playgroundUrl: 'http://localhost:8080/playground',
    port: 43_127,
    trustedClientDays: 30,
  };
  const store = new IdentityStore(new TestMasterKeyProvider(), directory);
  const prompts: PairingPrompt[] = [];
  const agent = await startLocalAgent({
    operations: new AgentOperations(store, profile),
    profile,
    stateDirectory: directory,
    port: 0,
    onPairingPrompt: prompt => prompts.push(prompt),
  });
  resources.push({ directory, agent });
  return { agent, baseUrl: `http://127.0.0.1:${agent.port}`, prompts };
}
