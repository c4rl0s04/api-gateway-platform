import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDb } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  loadOrCreateBrowserAgentIdentity,
  signAgentProof,
} from '../lib/browser-agent-identity.js';

const originalIndexedDb = globalThis.indexedDB;
const originalNavigator = globalThis.navigator;

beforeEach(async () => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fakeIndexedDb });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { platform: 'Test OS', userAgent: 'Chrome/140.0' },
  });
  await deleteDatabase();
});

afterEach(async () => {
  await deleteDatabase();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
});

describe('gatewayctl browser control identity', () => {
  it('restores the same non-exportable P-256 identity from IndexedDB', async () => {
    const created = await loadOrCreateBrowserAgentIdentity();
    const restored = await loadOrCreateBrowserAgentIdentity();

    assert.equal(restored.clientId, created.clientId);
    assert.deepEqual(restored.publicJwk, created.publicJwk);
    assert.equal(restored.privateKey.extractable, false);
    assert.equal(restored.privateKey.algorithm.name, 'ECDSA');
    await assert.rejects(crypto.subtle.exportKey('jwk', restored.privateKey));
    assert.match(await signAgentProof(restored, 'gatewayctl-test-proof'), /^[a-zA-Z0-9_-]+$/u);
  });

  it('creates a different browser identity after local browser storage is cleared', async () => {
    const original = await loadOrCreateBrowserAgentIdentity();
    await deleteDatabase();
    const replacement = await loadOrCreateBrowserAgentIdentity();
    assert.notEqual(replacement.clientId, original.clientId);
    assert.notDeepEqual(replacement.publicJwk, original.publicJwk);
  });
});

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDb.deleteDatabase('api-gateway-platform');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser identity database remained open'));
  });
}
