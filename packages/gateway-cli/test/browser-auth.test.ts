import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { exportJWK } from 'jose';
import {
  BrowserAgentAuth,
  GatewayCtlError,
  pairingProofMessage,
  sessionProofMessage,
  TrustedClientStore,
  type PairingPrompt,
} from '../src/index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('gatewayctl browser authorization', () => {
  it('pairs once and restores sessions through signed one-use challenges', async () => {
    const fixture = await setup();
    const pairing = await fixture.auth.createPairing(fixture.client);
    const first = await fixture.auth.completePairing({
      pairingId: pairing.pairingId,
      code: fixture.prompts[0]!.code,
      signature: proof(fixture.privateKey, pairingProofMessage({
        pairingId: pairing.pairingId,
        nonce: pairing.nonce,
        origin: fixture.client.origin,
        instanceId: 'agent-instance',
        clientId: fixture.client.clientId,
      })),
    });
    assert.equal((await fixture.auth.authorize(first.token, fixture.client.origin)).clientId, fixture.client.clientId);

    const challenge = await fixture.auth.createSessionChallenge(fixture.client);
    const restored = await fixture.auth.completeSession({
      challengeId: challenge.challengeId,
      signature: proof(fixture.privateKey, sessionProofMessage({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        origin: fixture.client.origin,
        instanceId: 'agent-instance',
        clientId: fixture.client.clientId,
      })),
    });
    assert.ok(restored.token);
    await assert.rejects(
      fixture.auth.completeSession({ challengeId: challenge.challengeId, signature: 'replay' }),
      hasCode('challenge_expired'),
    );
  });

  it('limits invalid pairing codes and rejects signature replay across agent instances', async () => {
    const fixture = await setup();
    const pairing = await fixture.auth.createPairing(fixture.client);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(
        fixture.auth.completePairing({ pairingId: pairing.pairingId, code: 'BAD-CODE', signature: 'bad' }),
        hasCode('pairing_code_invalid'),
      );
    }
    await assert.rejects(
      fixture.auth.completePairing({ pairingId: pairing.pairingId, code: fixture.prompts[0]!.code, signature: 'bad' }),
      hasCode('pairing_expired'),
    );

    const next = await fixture.auth.createPairing(fixture.client);
    await assert.rejects(
      fixture.auth.completePairing({
        pairingId: next.pairingId,
        code: fixture.prompts.at(-1)!.code,
        signature: proof(fixture.privateKey, pairingProofMessage({
          pairingId: next.pairingId,
          nonce: next.nonce,
          origin: fixture.client.origin,
          instanceId: 'different-agent',
          clientId: fixture.client.clientId,
        })),
      }),
      hasCode('client_proof_invalid'),
    );
  });

  it('invalidates active sessions after trusted-client revocation', async () => {
    const fixture = await setup();
    const pairing = await fixture.auth.createPairing(fixture.client);
    const session = await fixture.auth.completePairing({
      pairingId: pairing.pairingId,
      code: fixture.prompts[0]!.code,
      signature: proof(fixture.privateKey, pairingProofMessage({
        pairingId: pairing.pairingId,
        nonce: pairing.nonce,
        origin: fixture.client.origin,
        instanceId: 'agent-instance',
        clientId: fixture.client.clientId,
      })),
    });
    await fixture.store.revoke(fixture.client.clientId);
    await assert.rejects(
      fixture.auth.authorize(session.token, fixture.client.origin),
      hasCode('session_invalid'),
    );
  });

  it('accepts browser WebCrypto P-256 proofs and expires pending challenges', async () => {
    let now = Date.parse('2030-01-01T00:00:00.000Z');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-webcrypto-'));
    directories.push(directory);
    const store = new TrustedClientStore(directory, 30);
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const prompts: PairingPrompt[] = [];
    const auth = new BrowserAgentAuth(store, 'agent-webcrypto', prompt => prompts.push(prompt), () => now);
    const client = {
      clientId: 'browser-webcrypto-0001',
      origin: 'http://localhost:8080',
      label: 'Chromium test',
      publicJwk,
    };
    const pairing = await auth.createPairing(client);
    const message = pairingProofMessage({
      pairingId: pairing.pairingId,
      nonce: pairing.nonce,
      origin: client.origin,
      instanceId: 'agent-webcrypto',
      clientId: client.clientId,
    });
    const signature = Buffer.from(await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      new TextEncoder().encode(message),
    )).toString('base64url');
    assert.ok((await auth.completePairing({
      pairingId: pairing.pairingId,
      code: prompts[0]!.code,
      signature,
    })).token);

    const challenge = await auth.createSessionChallenge(client);
    now += 31_000;
    await assert.rejects(
      auth.completeSession({ challengeId: challenge.challengeId, signature: 'expired' }),
      hasCode('challenge_expired'),
    );
  });
});

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-auth-'));
  directories.push(directory);
  const store = new TrustedClientStore(directory, 30);
  const prompts: PairingPrompt[] = [];
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const client = {
    clientId: 'browser-client-auth-0001',
    origin: 'http://localhost:8080',
    label: 'Test browser',
    publicJwk: await exportJWK(publicKey),
  };
  return {
    auth: new BrowserAgentAuth(store, 'agent-instance', prompt => prompts.push(prompt)),
    client,
    directory,
    privateKey,
    prompts,
    store,
  };
}

function proof(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], message: string): string {
  return sign('sha256', Buffer.from(message), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof GatewayCtlError && error.code === code;
}
