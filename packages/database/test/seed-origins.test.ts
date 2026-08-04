import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeploymentRegion, DeploymentStage } from '../src/generated/index.js';
import {
  environmentPublicOrigin,
  parseGatewayPublicPort,
} from '../src/seed.js';

describe('development environment origins', () => {
  it('keeps the local gateway port as the default', () => {
    assert.equal(
      environmentPublicOrigin(DeploymentStage.qual, DeploymentRegion.es),
      'https://qual-es.gateway.localhost:8443',
    );
  });

  it('supports an isolated platform port', () => {
    assert.equal(
      environmentPublicOrigin(DeploymentStage.prod, DeploymentRegion.uk, 18443),
      'https://prod-uk.gateway.localhost:18443',
    );
  });

  it('rejects invalid configured ports', () => {
    assert.throws(() => parseGatewayPublicPort('0'));
    assert.throws(() => parseGatewayPublicPort('not-a-port'));
    assert.throws(() => parseGatewayPublicPort('65536'));
  });
});
