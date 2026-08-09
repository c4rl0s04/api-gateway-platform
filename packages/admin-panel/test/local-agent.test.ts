import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { LocalAgentClient, LocalAgentError } from '../lib/local-agent.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('playground local-agent client', () => {
  it('parses gatewayctl pairing data without accepting malformed ports or nonces', () => {
    const encoded = Buffer.from(JSON.stringify({
      port: 41_234,
      nonce: 'a'.repeat(43),
    })).toString('base64url');
    assert.deepEqual(
      LocalAgentClient.pairingFromFragment(`#gatewayctl=${encoded}`),
      { port: 41_234, nonce: 'a'.repeat(43) },
    );
    assert.equal(LocalAgentClient.pairingFromFragment('#gatewayctl=invalid'), null);
    assert.equal(LocalAgentClient.pairingFromFragment('#other=value'), null);
  });

  it('pairs and sends only authenticated RPC requests to the advertised loopback port', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/pair')) {
        return Response.json({
          token: 'session-token',
          expiresAt: '2030-01-01T00:30:00.000Z',
        });
      }
      return Response.json({ result: [{
        id: 'identity-1',
        name: 'banking-jwt',
        type: 'jwt',
        source: 'generated',
        algorithm: 'RS256',
        fingerprint: 'abc',
        hasCertificate: false,
        createdAt: '2030-01-01T00:00:00.000Z',
      }] });
    };

    const paired = await LocalAgentClient.pair({
      port: 41_234,
      nonce: 'nonce-value',
    });
    const identities = await paired.client.listIdentities();

    assert.equal(identities[0]?.name, 'banking-jwt');
    assert.equal(requests[0]?.url, 'http://127.0.0.1:41234/pair');
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      nonce: 'nonce-value',
    });
    assert.equal(requests[1]?.url, 'http://127.0.0.1:41234/rpc');
    assert.equal(
      new Headers(requests[1]?.init?.headers).get('authorization'),
      'Bearer session-token',
    );
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      method: 'identity.list',
      params: {},
    });
  });

  it('surfaces closed agent error codes without exposing implementation details', async () => {
    globalThis.fetch = async () => Response.json({
      error: {
        code: 'operation_not_allowed',
        message: 'The requested local-agent operation is not allowed',
      },
    }, { status: 400 });
    const client = new LocalAgentClient(41_234, 'session-token');

    await assert.rejects(
      client.listIdentities(),
      (error: unknown) => error instanceof LocalAgentError
        && error.code === 'operation_not_allowed',
    );
  });

  it('restores only an explicit temporary browser session', async () => {
    const { LocalAgentClient } = await import('../lib/local-agent.js');
    const client = LocalAgentClient.restore({
      port: 43123,
      token: 'temporary-session-token-with-enough-entropy',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    assert.deepEqual(client.session('2030-01-01T00:00:00.000Z'), {
      port: 43123,
      token: 'temporary-session-token-with-enough-entropy',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
  });
});
