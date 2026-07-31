import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileProxyBundle } from '../src/proxy-bundle.js';
import {
  buildSeedRevisionSources,
  PROXY_SEED_SCENARIOS,
} from '../src/seed-proxy-scenarios.js';

describe('development proxy seed catalog', () => {
  it('compiles every revision through the production bundle validator', async () => {
    let revisionCount = 0;
    for (const scenario of PROXY_SEED_SCENARIOS) {
      for (const revision of scenario.revisions) {
        const compiled = await compileProxyBundle({
          ...buildSeedRevisionSources(scenario.proxyId, revision),
          systemManaged: scenario.systemManaged === true,
        });
        assert.equal(compiled.operations.length, revision.operations.length);
        revisionCount += 1;
      }
    }
    assert.equal(revisionCount, 16);
  });

  it('contains promotion, rollback, undeployed, and policy-change examples', () => {
    const esBanking = PROXY_SEED_SCENARIOS.find(
      scenario => scenario.proxyId === 'proxy-es-banking',
    )!;
    const logistics = PROXY_SEED_SCENARIOS.find(
      scenario => scenario.proxyId === 'proxy-uk-logistics',
    )!;
    const commerce = PROXY_SEED_SCENARIOS.find(
      scenario => scenario.proxyId === 'proxy-fr-ecommerce',
    )!;

    assert.equal(esBanking.revisions.length, 3);
    assert.equal(
      esBanking.deployments?.some(event => event.revision === 3),
      false,
    );
    assert.deepEqual(
      logistics.deployments?.map(event => event.environmentId),
      ['env-qual-uk', 'env-pprod-uk', 'env-prod-uk'],
    );
    assert.deepEqual(
      commerce.deployments?.map(event => event.revision),
      [1, 2, 1],
    );
    assert.notDeepEqual(
      esBanking.revisions[0].operations,
      esBanking.revisions[1].operations,
    );
  });
});
