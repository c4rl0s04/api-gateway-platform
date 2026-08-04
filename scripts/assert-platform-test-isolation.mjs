#!/usr/bin/env node

import assert from 'node:assert/strict';
import { stdin } from 'node:process';
import path from 'node:path';

const testRoot = path.resolve(process.argv[2] ?? '');
const projectName = process.argv[3] ?? '';
const input = [];
for await (const chunk of stdin) input.push(chunk);
const config = JSON.parse(Buffer.concat(input).toString('utf8'));

function publishedPorts(serviceName) {
  return (config.services[serviceName].ports ?? [])
    .map(port => Number(port.published))
    .sort((left, right) => left - right);
}

function sourceForTarget(serviceName, target) {
  return config.services[serviceName].volumes
    .find(volume => volume.target === target)?.source;
}

function assertInsideTestRoot(candidate, label) {
  const relative = path.relative(testRoot, path.resolve(candidate ?? ''));
  assert.ok(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    `${label} must be inside the isolated test directory`,
  );
}

assert.match(projectName, /^api-gateway-platform-e2e-[a-z0-9]+$/);
assert.equal(config.name, projectName);
assert.equal(config.services.postgres.environment.POSTGRES_DB, 'apigw_e2e');
for (const serviceName of ['database-setup', 'gateway', 'management-api']) {
  assert.match(
    config.services[serviceName].environment.DATABASE_URL,
    /\/apigw_e2e\?schema=public$/,
  );
}
assert.equal(config.services.gateway.environment.GATEWAY_INSTANCE_ID, 'gateway-e2e');
assert.deepEqual(publishedPorts('admin-panel'), [18080]);
assert.deepEqual(publishedPorts('keycloak'), [18081]);
assert.deepEqual(publishedPorts('envoy'), [18443]);
assert.deepEqual(config.networks.default.ipam.config, [{ subnet: '172.31.0.0/24' }]);
assert.match(config.volumes['postgres-data'].name, new RegExp(`^${projectName}_`));
assert.match(config.volumes['keycloak-data'].name, new RegExp(`^${projectName}_`));

assertInsideTestRoot(
  sourceForTarget('keycloak', '/opt/keycloak/data/import/realm.json'),
  'Keycloak realm',
);
for (const [serviceName, target] of [
  ['management-api', '/run/platform-secrets'],
  ['management-api', '/runtime-sds'],
  ['envoy', '/run/platform-secrets'],
  ['envoy', '/etc/envoy/sds'],
]) {
  assertInsideTestRoot(
    sourceForTarget(serviceName, target),
    `${serviceName}:${target}`,
  );
}

console.log('Isolated platform Compose configuration verified');
