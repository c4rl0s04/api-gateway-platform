import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
Object.defineProperty(globalThis, 'btoa', {
  value: (value: string) => Buffer.from(value, 'binary').toString('base64'),
  configurable: true,
});

function decode(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
}

test('browser lab identity signs a short-lived RS256 assertion in memory', async () => {
  const {
    createBrowserJwtIdentity,
    signBrowserJwtAssertion,
  } = await import('../lib/browser-jwt.js');
  const identity = await createBrowserJwtIdentity();
  const signed = await signBrowserJwtAssertion({
    identity,
    consumerKey: 'lab-consumer-key',
    audience: 'https://workspace.lab.gateway.localhost:8443/oauth/token',
    now: 1_700_000_000,
  });
  const [encodedHeader, encodedPayload, encodedSignature] = signed.assertion.split('.');

  assert.equal(decode(encodedHeader).alg, 'RS256');
  assert.equal(decode(encodedHeader).kid, identity.kid);
  assert.deepEqual(decode(encodedPayload), {
    iss: 'lab-consumer-key',
    sub: 'lab-consumer-key',
    aud: 'https://workspace.lab.gateway.localhost:8443/oauth/token',
    iat: 1_700_000_000,
    exp: 1_700_000_060,
    jti: signed.payload.jti,
  });
  assert.ok(encodedSignature.length > 100);
  assert.equal(identity.publicJwk.d, undefined);
  assert.equal(identity.publicJwk.alg, 'RS256');
});
