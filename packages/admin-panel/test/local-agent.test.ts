import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { BrowserAgentIdentity } from '../lib/browser-agent-identity.js';
import {
  buildMtlsImportCommand,
  LocalAgentClient,
  LocalAgentError,
} from '../lib/local-agent.js';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'http://localhost:8080' },
      setTimeout,
      clearTimeout,
    },
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
});

describe('playground local-agent client', () => {
  it('builds a safe local mTLS import command with an optional chain', () => {
    assert.equal(buildMtlsImportCommand({
      name: 'banking-mtls',
      keyFile: './client key.pem',
      certificateFile: "./client's.crt",
      chainFile: './chain.crt',
    }), [
      'npm run gatewayctl -- keys add \\',
      "  --name 'banking-mtls' \\",
      "  --type 'mtls' \\",
      "  --key './client key.pem' \\",
      "  --certificate './client'\"'\"'s.crt' \\",
      "  --chain './chain.crt'",
    ].join('\n'));
    assert.doesNotMatch(buildMtlsImportCommand({
      name: 'without-chain',
      keyFile: './client.key',
      certificateFile: './client.crt',
    }), /--chain/u);
  });

  it('discovers protocol v2 and restores a signed session before RPC', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/v1/status')) return Response.json(agentStatus());
      if (url.endsWith('/v1/sessions/challenges')) {
        return Response.json({ challengeId: 'challenge-1', nonce: 'nonce-1', expiresAt: '2030-01-01T00:00:30.000Z' });
      }
      if (url.endsWith('/v1/sessions')) {
        return Response.json({ token: 'session-token', expiresAt: '2030-01-01T00:15:00.000Z', trustedUntil: '2030-01-31T00:00:00.000Z' });
      }
      return Response.json({ result: [{
        id: 'identity-1', name: 'banking-jwt', type: 'jwt', source: 'generated',
        algorithm: 'RS256', fingerprint: 'abc', hasCertificate: false,
        createdAt: '2030-01-01T00:00:00.000Z',
      }] });
    };
    const identity = await browserIdentity();
    const status = await LocalAgentClient.discover(43_127);
    const client = await LocalAgentClient.connectTrusted(43_127, status, identity);
    const identities = await client.listIdentities();

    assert.equal(identities[0]?.name, 'banking-jwt');
    assert.deepEqual(requests.map(request => new URL(request.url).pathname), [
      '/v1/status', '/v1/sessions/challenges', '/v1/sessions', '/v1/rpc',
    ]);
    assert.equal(new Headers(requests[3]?.init?.headers).get('authorization'), 'Bearer session-token');
    assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), { method: 'identity.list', params: {} });
    assert.equal((requests[0]?.init as RequestInit & { targetAddressSpace?: string }).targetAddressSpace, 'local');
  });

  it('requests terminal pairing without sending private browser material', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ pairingId: 'pairing-1', nonce: 'nonce', expiresAt: '2030-01-01T00:02:00.000Z' }, { status: 202 });
    };
    const identity = await browserIdentity();
    await LocalAgentClient.requestPairing(43_127, identity);
    const body = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(body.clientId, identity.clientId);
    assert.deepEqual(body.publicJwk, identity.publicJwk);
    assert.equal('privateKey' in body, false);
  });

  it('surfaces stable agent errors and network availability failures', async () => {
    globalThis.fetch = async () => Response.json({
      error: { code: 'client_not_registered', message: 'Browser client is not trusted' },
    }, { status: 404 });
    await assert.rejects(
      LocalAgentClient.connectTrusted(43_127, agentStatus(), await browserIdentity()),
      (error: unknown) => error instanceof LocalAgentError && error.code === 'client_not_registered',
    );

    globalThis.fetch = async () => { throw new TypeError('blocked'); };
    await assert.rejects(
      LocalAgentClient.discover(43_127),
      (error: unknown) => error instanceof LocalAgentError && error.code === 'agent_unavailable',
    );

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { permissions: { query: async () => ({ state: 'denied' }) } },
    });
    await assert.rejects(
      LocalAgentClient.discover(43_127),
      (error: unknown) => error instanceof LocalAgentError
        && error.code === 'local_network_access_denied',
    );
  });
});

async function browserIdentity(): Promise<BrowserAgentIdentity> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  return {
    clientId: 'browser-test-client-0001',
    label: 'Test browser',
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateKey: pair.privateKey,
    createdAt: '2030-01-01T00:00:00.000Z',
  };
}

function agentStatus() {
  return {
    name: 'gatewayctl' as const,
    protocolVersion: 2,
    agentVersion: '1.0.0',
    instanceId: 'agent-instance',
    capabilities: ['identity.list'],
  };
}
