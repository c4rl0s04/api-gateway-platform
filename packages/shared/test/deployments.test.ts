import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEPLOYMENT_REGIONS,
  canDeployToStage,
  environmentConfigSchema,
  formatEnvironmentName,
} from '../src';

describe('deployment contracts', () => {
  it('accepts only closed environment choices', () => {
    const environment = environmentConfigSchema.parse({
      id: 'env-qual-de',
      stage: 'qual',
      region: 'de',
      publicOrigin: 'https://qual-de.gateway.localhost:8443',
    });

    assert.equal(formatEnvironmentName(environment), 'qual-de');
    assert.ok(DEPLOYMENT_REGIONS.includes('ce'));
    assert.throws(
      () => environmentConfigSchema.parse({
        ...environment,
        stage: 'staging',
      }),
      /Invalid enum value/,
    );
    assert.throws(
      () => environmentConfigSchema.parse({
        ...environment,
        region: 'au',
      }),
      /Invalid enum value/,
    );
  });

  it('accepts only canonical HTTPS public origins', () => {
    const environment = {
      id: 'env-qual-de',
      stage: 'qual',
      region: 'de',
    } as const;

    assert.doesNotThrow(() =>
      environmentConfigSchema.parse({
        ...environment,
        publicOrigin: 'https://qual-de.gateway.localhost:8443',
      }),
    );
    assert.throws(
      () =>
        environmentConfigSchema.parse({
          ...environment,
          publicOrigin: 'https://qual-de.gateway.localhost:8443/oauth',
        }),
      /Expected an HTTPS origin/,
    );
    assert.throws(
      () =>
        environmentConfigSchema.parse({
          ...environment,
          publicOrigin: 'http://qual-de.gateway.localhost:8443',
        }),
      /Expected an HTTPS origin/,
    );
  });

  it('enforces the qual -> pprod -> prod progression', () => {
    assert.equal(canDeployToStage('qual', []), true);
    assert.equal(canDeployToStage('pprod', []), false);
    assert.equal(canDeployToStage('pprod', ['qual']), true);
    assert.equal(canDeployToStage('prod', ['qual']), false);
    assert.equal(canDeployToStage('prod', ['qual', 'pprod']), true);
  });
});
