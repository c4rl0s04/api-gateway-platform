import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LabPrincipal } from '@api-gateway/database';
import { LabExampleService } from '../src/services/lab-example.js';

describe('personal lab example', () => {
  it('creates a mock, immutable proxy revision, deployment, product, and lab app', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const principal: LabPrincipal = { issuer: 'https://identity.test', subject: 'owner' };
    const example = new LabExampleService(
      {
        list: async () => [],
        create: async (input, actor) => {
          calls.push(['upstream', input, actor]);
          return { id: 'upstream-1' };
        },
        update: async () => ({}),
      },
      {
        list: async () => [], get: async () => ({}), listDeployments: async () => [],
        create: async () => ({}), validate: async () => ({}), update: async () => ({}),
        importRevision: async () => ({}), listRevisions: async () => [], getRevision: async () => ({}),
        retire: async () => ({}),
        createConfigured: async (input, actor) => {
          calls.push(['proxy', input, actor]);
          return { proxy: { id: 'proxy-1' }, revision: { revisionNumber: 1 } };
        },
        deploy: async (proxyId, revision, input, actor) => {
          calls.push(['deployment', proxyId, revision, input, actor]);
          return { id: 'deployment-1' };
        },
      },
      {
        listEnvironments: async () => [], list: async () => [], get: async () => ({}), update: async () => ({}),
        create: async (input, actor) => {
          calls.push(['product', input, actor]);
          return { id: 'product-1' };
        },
      },
      {
        list: async () => [], get: async () => ({}), update: async () => ({}), createCredential: async () => ({}),
        getCredential: async () => ({}), updateCredential: async () => ({}), rotateCredential: async () => ({}),
        replaceGrants: async () => ({}), listPublicKeys: async () => [], registerPublicKey: async () => ({}),
        revokePublicKey: async () => ({}),
        register: async (input, actor) => {
          calls.push(['application', input, actor]);
          return { application: { id: 'app-1' }, credential: { id: 'credential-1' }, consumerSecret: 'once' };
        },
      },
      async () => ({ id: 'env-qual-es', stage: 'qual', region: 'es' }),
    );
    const result = await example.provision(principal) as {
      application: { consumerSecret: string };
    };
    assert.equal(result.application.consumerSecret, 'once');
    assert.deepEqual(calls.map(call => call[0]), [
      'upstream', 'proxy', 'deployment', 'product', 'application',
    ]);
    const proxyInput = calls[1]![1] as { openapiSource: string; gatewayConfigSource: string };
    assert.match(proxyInput.openapiSource, /listAccounts/u);
    assert.match(proxyInput.gatewayConfigSource, /oauth-access-token/u);
    assert.match(proxyInput.gatewayConfigSource, /mtls-auth/u);
  });
});
