#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateClientKeyAndCsr } from '../packages/pki/dist/index.js';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const secrets = path.resolve(
  process.env.PLATFORM_TEST_SECRETS_DIR ?? path.join(root, '.local-secrets'),
);
const composeEnvironment = path.resolve(
  process.env.PLATFORM_TEST_COMPOSE_ENV ?? path.join(secrets, 'compose.env'),
);
const usersEnvironment = path.join(secrets, 'keycloak/users.env');
const keycloakBaseUrl = process.env.PLATFORM_TEST_KEYCLOAK_URL
  ?? 'http://localhost:8081';
const adminPanelBaseUrl = process.env.PLATFORM_TEST_ADMIN_PANEL_URL
  ?? 'http://localhost:8080';
const gatewayPort = process.env.PLATFORM_TEST_GATEWAY_PORT ?? '8443';
const gatewayInstanceId = process.env.PLATFORM_TEST_GATEWAY_INSTANCE_ID
  ?? 'gateway-local';
const gatewayOrigin = hostname => `https://${hostname}:${gatewayPort}`;
const qualEsGatewayOrigin = gatewayOrigin('qual-es.gateway.localhost');
const composeProject = process.env.PLATFORM_TEST_COMPOSE_PROJECT;
const composeFiles = (process.env.PLATFORM_TEST_COMPOSE_FILES ?? '')
  .split(path.delimiter)
  .filter(Boolean)
  .map(file => path.resolve(file));
const workDirectory = await mkdtemp(path.join(os.tmpdir(), 'gateway-platform-e2e-'));

function composeArguments(...arguments_) {
  return [
    'compose',
    ...(composeProject ? ['--project-name', composeProject] : []),
    ...composeFiles.flatMap(file => ['--file', file]),
    '--env-file',
    composeEnvironment,
    ...arguments_,
  ];
}

function parseEnvironment(content) {
  return Object.fromEntries(
    content
      .split('\n')
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function tokenRequest(realm, parameters) {
  return request(
    `${keycloakBaseUrl}/realms/${realm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parameters),
    },
  );
}

async function waitFor(url, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service may still be restarting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Service did not become ready: ${url}`);
}

async function ensureTestClient(adminToken) {
  const headers = { authorization: `Bearer ${adminToken}` };
  const existing = await request(
    `${keycloakBaseUrl}/admin/realms/api-gateway/clients?clientId=platform-e2e`,
    { headers },
  );
  if (existing.length > 0) return;
  await request(`${keycloakBaseUrl}/admin/realms/api-gateway/clients`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: 'platform-e2e',
      name: 'Local Platform End-to-End Tests',
      enabled: true,
      publicClient: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: true,
      protocolMappers: [{
        name: 'management-api-audience',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-audience-mapper',
        consentRequired: false,
        config: {
          'included.client.audience': 'management-api',
          'id.token.claim': 'false',
          'access.token.claim': 'true',
        },
      }],
    }),
  });
}

async function management(token, route, options = {}) {
  const multipartBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
  return request(`${adminPanelBaseUrl}/api/management/${route}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body && !multipartBody ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
}

async function waitForManagement(token, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await management(token, 'me');
      return;
    } catch {
      // The BFF may briefly observe a refused connection during restart.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Management API did not become reachable through the BFF');
}

async function mtlsRequest(certificate, key) {
  try {
    const result = await exec('curl', [
      '--silent',
      '--show-error',
      '--cacert',
      path.join(secrets, 'pki/authorities/local-development/ca.crt'),
      '--cert',
      certificate,
      '--key',
      key,
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      `${qualEsGatewayOrigin}/es/banking/v1/health`,
    ]);
    return { exitCode: 0, status: result.stdout };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      status: error.stdout ?? '',
    };
  }
}

async function gatewayCurl(arguments_) {
  return exec('curl', [
    '--silent',
    '--show-error',
    '--cacert',
    path.join(secrets, 'pki/authorities/local-development/ca.crt'),
    ...arguments_,
  ]);
}

async function oauthClientCredentials(consumerKey, consumerSecret, scope) {
  const result = await gatewayCurl([
    '--user',
    `${consumerKey}:${consumerSecret}`,
    '--header',
    'content-type: application/x-www-form-urlencoded',
    '--data',
    `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    '--write-out',
    '\n%{http_code}',
    `${qualEsGatewayOrigin}/oauth/token`,
  ]);
  const lines = result.stdout.trimEnd().split('\n');
  const status = lines.pop();
  const bodyText = lines.join('\n');
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }
  return { status, body };
}

try {
  const users = parseEnvironment(await readFile(usersEnvironment, 'utf8'));
  await waitFor(`${keycloakBaseUrl}/realms/api-gateway`);
  await waitFor(adminPanelBaseUrl);

  const keycloakAdmin = await tokenRequest('master', {
    grant_type: 'password',
    client_id: 'admin-cli',
    username: 'local-admin',
    password: users.KEYCLOAK_ADMIN_PASSWORD,
  });
  await ensureTestClient(keycloakAdmin.access_token);

  let platformAccessToken;
  let platformAccessTokenExpiresAt = 0;
  const currentPlatformAccessToken = async (forceRefresh = false) => {
    if (forceRefresh || Date.now() >= platformAccessTokenExpiresAt - 5_000) {
      const identity = await tokenRequest('api-gateway', {
        grant_type: 'password',
        client_id: 'platform-e2e',
        username: 'platform-admin',
        password: users.PLATFORM_ADMIN_PASSWORD,
      });
      platformAccessToken = identity.access_token;
      platformAccessTokenExpiresAt = Date.now() + identity.expires_in * 1_000;
    }
    return platformAccessToken;
  };
  const platformManagement = async (route, options) =>
    management(await currentPlatformAccessToken(), route, options);
  const waitForRuntimeSync = async (mutation, attempts = 80) => {
    if (
      mutation.runtimeRefreshRequired !== false
      || mutation.runtimeSync?.state !== 'queued'
      || !Number.isInteger(mutation.runtimeSync?.version)
    ) {
      throw new Error('Routing mutation did not return a queued runtime version');
    }
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const status = await platformManagement('runtime-sync');
      const gateway = status.gateways.find(candidate =>
        candidate.instanceId === gatewayInstanceId);
      if (
        gateway?.state === 'applied'
        && gateway.appliedVersion >= mutation.runtimeSync.version
      ) {
        return status;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Gateway did not apply config version ${mutation.runtimeSync.version}`);
  };

  const principal = await platformManagement('me');
  if (!principal.memberships.some(membership => membership.role === 'platformAdmin')) {
    throw new Error('OIDC identity is not mapped to platformAdmin');
  }
  const environments = await platformManagement('environments');
  if (
    environments.length !== 30
    || new Set(environments.map(environment => environment.publicOrigin)).size !== 30
  ) {
    throw new Error('Management API did not expose 30 unique environment origins');
  }
  const proxies = await platformManagement('proxies');
  const oauthProxy = proxies.find(proxy => proxy.id === 'proxy-platform-oauth');
  if (!oauthProxy) {
    throw new Error('Management API did not expose the managed OAuth proxy');
  }
  const oauthDeployments = await platformManagement(
    `proxies/${oauthProxy.id}/deployments`,
  );
  if (oauthDeployments.length !== 30) {
    throw new Error('Managed OAuth proxy is not deployed in every environment');
  }

  const revisionSuffix = Date.now();
  const revisionBasePath = `/management-revision-e2e-${revisionSuffix}`;
  const managedProxy = await platformManagement(
    'organizations/org-bank-dev/proxies',
    {
      method: 'POST',
      body: JSON.stringify({ name: `Revision E2E ${revisionSuffix}` }),
    },
  );
  const importRevision = async (operationId, publicPath) => {
    const form = new FormData();
    form.append('openapi', new Blob([JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Revision E2E', version: '1.0.0' },
      paths: {
        [publicPath]: {
          get: {
            operationId,
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    })], { type: 'application/json' }), 'openapi.json');
    form.append('gateway', new Blob([JSON.stringify({
      apiVersion: 'gateway.platform/v1',
      basePath: revisionBasePath,
      defaults: { policies: [] },
      operations: { [operationId]: { targetPath: '/health' } },
    })], { type: 'application/json' }), 'gateway.json');
    return platformManagement(`proxies/${managedProxy.id}/revisions`, {
      method: 'POST',
      body: form,
    });
  };
  const deployRevision = revisionNumber => platformManagement(
    `proxies/${managedProxy.id}/revisions/${revisionNumber}/deployments`,
    {
      method: 'POST',
      body: JSON.stringify({
        environmentId: 'env-qual-es',
        upstreamBaseUrl: 'http://mock-backend:4000',
      }),
    },
  );

  const revision1 = await importRevision('getRevisionOne', '/revision-one');
  const firstDeployment = await deployRevision(revision1.revisionNumber);
  await waitForRuntimeSync(firstDeployment);
  const revisionOneResponse = await gatewayCurl([
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/revision-one`,
  ]);
  if (revisionOneResponse.stdout !== '200') {
    throw new Error('Gateway did not hot reload revision 1');
  }

  const revision2 = await importRevision('getRevisionTwo', '/revision-two');
  await waitForRuntimeSync(await deployRevision(revision2.revisionNumber));
  const revisionTwoResponse = await gatewayCurl([
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/revision-two`,
  ]);
  if (revisionTwoResponse.stdout !== '200') {
    throw new Error('Gateway did not hot reload revision 2');
  }

  await waitForRuntimeSync(await deployRevision(revision1.revisionNumber));
  const rollbackResponse = await gatewayCurl([
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/revision-one`,
  ]);
  const deploymentHistory = await platformManagement(
    `proxies/${managedProxy.id}/deployments`,
  );
  if (
    rollbackResponse.stdout !== '200'
    || deploymentHistory.length !== 3
    || deploymentHistory.filter(item => item.status === 'active').length !== 1
  ) {
    throw new Error('Proxy revision rollback history is inconsistent');
  }

  const appsBefore = await platformManagement(
    'organizations/org-bank-dev/apps',
  );
  const appName = `Platform application E2E ${Date.now()}`;
  const registration = await platformManagement(
    'organizations/org-bank-dev/apps',
    {
      method: 'POST',
      body: JSON.stringify({
        name: appName,
        products: [{ productId: 'product-banking-apis' }],
      }),
    },
  );
  if (
    !registration.credential.consumerKey.startsWith('ck_')
    || !registration.consumerSecret.startsWith('cs_')
  ) {
    throw new Error('Application registration did not generate credential material');
  }

  const appsAfter = await platformManagement(
    'organizations/org-bank-dev/apps',
  );
  const persisted = appsAfter.find(app => app.id === registration.application.id);
  if (!persisted) {
    throw new Error('Registered application was not persisted');
  }
  const serializedApps = JSON.stringify(appsAfter);
  if (
    serializedApps.includes(registration.consumerSecret)
    || serializedApps.includes('consumerSecretHash')
  ) {
    throw new Error('Application reads exposed secret credential material');
  }

  let rejectedInvalidProduct = false;
  try {
    await platformManagement(
      'organizations/org-bank-dev/apps',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Invalid application E2E ${Date.now()}`,
          products: [{ productId: 'product-identity-apis' }],
        }),
      },
    );
  } catch (error) {
    rejectedInvalidProduct = error.message.includes('400');
  }
  const appsAfterRejection = await platformManagement(
    'organizations/org-bank-dev/apps',
  );
  if (
    !rejectedInvalidProduct
    || appsAfterRejection.length !== appsBefore.length + 1
  ) {
    throw new Error('Invalid application registration was not rolled back');
  }

  const apiKeyResponse = await gatewayCurl([
    '--header',
    `x-api-key: ${registration.credential.consumerKey}`,
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    `${qualEsGatewayOrigin}/es/banking/v1/accounts`,
  ]);
  if (apiKeyResponse.stdout !== '200') {
    throw new Error(`Generated API key was not accepted: ${apiKeyResponse.stdout}`);
  }

  const tokenResponse = await gatewayCurl([
    '--user',
    `${registration.credential.consumerKey}:${registration.consumerSecret}`,
    '--header',
    'content-type: application/x-www-form-urlencoded',
    '--data',
    'grant_type=client_credentials&scope=banking%3Aread',
    `${qualEsGatewayOrigin}/oauth/token`,
  ]);
  const accessTokenResponse = JSON.parse(tokenResponse.stdout);
  if (!accessTokenResponse.access_token) {
    throw new Error('Generated client credentials did not issue an access token');
  }
  const bearerResponse = await gatewayCurl([
    '--header',
    `authorization: Bearer ${accessTokenResponse.access_token}`,
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    `${qualEsGatewayOrigin}/es/banking/v1/accounts/1`,
  ]);
  if (bearerResponse.stdout !== '200') {
    throw new Error(`Issued access token was not accepted: ${bearerResponse.stdout}`);
  }
  const prodOrigin = gatewayOrigin('prod-es.gateway.localhost');
  const prodTokenResponse = await gatewayCurl([
    '--user',
    `${registration.credential.consumerKey}:${registration.consumerSecret}`,
    '--header',
    'content-type: application/x-www-form-urlencoded',
    '--data',
    'grant_type=client_credentials&scope=banking%3Aread',
    `${prodOrigin}/oauth/token`,
  ]);
  const prodAccessToken = JSON.parse(prodTokenResponse.stdout).access_token;
  const crossEnvironmentResponse = await gatewayCurl([
    '--header',
    `authorization: Bearer ${prodAccessToken}`,
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    `${qualEsGatewayOrigin}/es/banking/v1/accounts/1`,
  ]);
  if (crossEnvironmentResponse.stdout !== '401') {
    throw new Error('An access token was accepted outside its issuing environment');
  }
  const unknownEnvironment = await gatewayCurl([
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    gatewayOrigin('localhost') + '/oauth/.well-known/jwks.json',
  ]);
  if (unknownEnvironment.stdout !== '421') {
    throw new Error('An unknown gateway environment host was not rejected');
  }

  const organization = await platformManagement('organizations', {
    method: 'POST',
    body: JSON.stringify({ name: `Management E2E organization ${revisionSuffix}` }),
  });
  const renamedOrganization = await platformManagement(
    `organizations/${organization.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name: `Renamed management E2E ${revisionSuffix}` }),
    },
  );
  if (renamedOrganization.name !== `Renamed management E2E ${revisionSuffix}`) {
    throw new Error('Organization mutation did not persist');
  }

  const updatedProxy = await platformManagement(`proxies/${managedProxy.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: `Managed auth proxy ${revisionSuffix}` }),
  });
  if (updatedProxy.name !== `Managed auth proxy ${revisionSuffix}`) {
    throw new Error('Logical proxy mutation did not persist');
  }

  const authenticatedRevisionForm = new FormData();
  authenticatedRevisionForm.append('openapi', new Blob([JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Management authentication E2E', version: '1.0.0' },
    paths: {
      '/api-key': {
        get: {
          operationId: 'getWithApiKey',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/oauth': {
        get: {
          operationId: 'getWithOAuth',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  })], { type: 'application/json' }), 'openapi.json');
  authenticatedRevisionForm.append('gateway', new Blob([JSON.stringify({
    apiVersion: 'gateway.platform/v1',
    basePath: revisionBasePath,
    defaults: { policies: [] },
    operations: {
      getWithApiKey: {
        targetPath: '/health',
        policies: [{
          type: 'api-key-auth',
          config: { header: 'x-api-key', failureMode: 'closed' },
        }],
      },
      getWithOAuth: {
        targetPath: '/health',
        policies: [{
          type: 'oauth-access-token',
          config: {
            audience: 'api-gateway',
            requiredScopes: ['banking:read'],
            failureMode: 'closed',
          },
        }],
      },
    },
  })], { type: 'application/json' }), 'gateway.json');
  const authenticatedRevision = await platformManagement(
    `proxies/${managedProxy.id}/revisions`,
    { method: 'POST', body: authenticatedRevisionForm },
  );
  const authenticatedDeployment = await deployRevision(
    authenticatedRevision.revisionNumber,
  );
  await waitForRuntimeSync(authenticatedDeployment);

  const managedProduct = await platformManagement(
    'organizations/org-bank-dev/products',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Management product ${revisionSuffix}`,
        scopes: ['banking:read', 'banking:write'],
        proxyIds: [managedProxy.id],
        environmentIds: ['env-qual-es'],
      }),
    },
  );
  const managedProductDetail = await platformManagement(`products/${managedProduct.id}`);
  if (!managedProductDetail.proxies.some(proxy => proxy.id === managedProxy.id)) {
    throw new Error('Product was not associated with the managed proxy');
  }

  const managedRegistration = await platformManagement(
    'organizations/org-bank-dev/apps',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Management flow app ${revisionSuffix}`,
        products: [{
          productId: managedProduct.id,
          scopes: ['banking:read', 'banking:write'],
        }],
      }),
    },
  );
  const managedApiKey = await gatewayCurl([
    '--header',
    `x-api-key: ${managedRegistration.credential.consumerKey}`,
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/api-key`,
  ]);
  if (managedApiKey.stdout !== '200') {
    throw new Error('Dynamically created product and app did not authorize API key access');
  }
  const managedToken = await oauthClientCredentials(
    managedRegistration.credential.consumerKey,
    managedRegistration.consumerSecret,
    'banking:read',
  );
  if (managedToken.status !== '200' || !managedToken.body.access_token) {
    throw new Error('Dynamically created app did not obtain an OAuth token');
  }
  const originalManagedKey = managedRegistration.credential.consumerKey;
  const customizedManagedKey = `managed_${revisionSuffix}`;
  const customizedCredential = await platformManagement(
    `credentials/${managedRegistration.credential.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ consumerKey: `  ${customizedManagedKey}  ` }),
    },
  );
  if (customizedCredential.consumerKey !== customizedManagedKey) {
    throw new Error('Consumer key customization was not normalized and persisted');
  }
  const oldKeyApiResponse = await gatewayCurl([
    '--header', `x-api-key: ${originalManagedKey}`,
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/api-key`,
  ]);
  const newKeyApiResponse = await gatewayCurl([
    '--header', `x-api-key: ${customizedManagedKey}`,
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/api-key`,
  ]);
  const oldKeyOAuth = await oauthClientCredentials(
    originalManagedKey,
    managedRegistration.consumerSecret,
    'banking:read',
  );
  const newKeyOAuth = await oauthClientCredentials(
    customizedManagedKey,
    managedRegistration.consumerSecret,
    'banking:read',
  );
  if (
    oldKeyApiResponse.stdout !== '401'
    || newKeyApiResponse.stdout !== '200'
    || oldKeyOAuth.status !== '401'
    || newKeyOAuth.status !== '200'
  ) {
    throw new Error('Consumer key replacement did not take effect immediately');
  }
  const managedBearer = await gatewayCurl([
    '--header',
    `authorization: Bearer ${managedToken.body.access_token}`,
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/oauth`,
  ]);
  if (managedBearer.stdout !== '200') {
    throw new Error('Dynamically issued OAuth token was not authorized');
  }

  const additionalCredential = await platformManagement(
    `apps/${managedRegistration.application.id}/credentials`,
    {
      method: 'POST',
      body: JSON.stringify({
        products: [{
          productId: managedProduct.id,
          scopes: ['banking:read', 'banking:write'],
        }],
      }),
    },
  );
  const beforeRotation = additionalCredential.consumerSecret;
  const rotation = await platformManagement(
    `credentials/${additionalCredential.credential.id}/rotate-secret`,
    { method: 'POST' },
  );
  const rejectedOldSecret = await oauthClientCredentials(
    additionalCredential.credential.consumerKey,
    beforeRotation,
    'banking:read',
  );
  const acceptedRotatedSecret = await oauthClientCredentials(
    additionalCredential.credential.consumerKey,
    rotation.consumerSecret,
    'banking:read',
  );
  if (rejectedOldSecret.status !== '401' || acceptedRotatedSecret.status !== '200') {
    throw new Error('Consumer secret rotation did not invalidate only the old secret');
  }

  await platformManagement(
    `credentials/${additionalCredential.credential.id}/product-grants`,
    { method: 'PUT', body: JSON.stringify({ products: [] }) },
  );
  const deniedWithoutGrant = await gatewayCurl([
    '--header',
    `x-api-key: ${additionalCredential.credential.consumerKey}`,
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/api-key`,
  ]);
  if (deniedWithoutGrant.stdout !== '403') {
    throw new Error('Removing credential grants did not revoke product access');
  }
  await platformManagement(
    `credentials/${additionalCredential.credential.id}/product-grants`,
    {
      method: 'PUT',
      body: JSON.stringify({
        products: [{
          productId: managedProduct.id,
          scopes: ['banking:read', 'banking:write'],
        }],
      }),
    },
  );
  await platformManagement(`products/${managedProduct.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ scopes: ['banking:read'] }),
  });
  const credentialDetail = await platformManagement(
    `credentials/${additionalCredential.credential.id}`,
  );
  const managedGrant = credentialDetail.productGrants.find(
    grant => grant.product.id === managedProduct.id,
  );
  if (!managedGrant || managedGrant.scopes.join(' ') !== 'banking:read') {
    throw new Error('Product scope reduction did not trim credential grants');
  }

  const publicJwk = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .publicKey.export({ format: 'jwk' });
  const registeredKey = await platformManagement(
    `credentials/${additionalCredential.credential.id}/public-keys`,
    {
      method: 'POST',
      body: JSON.stringify({ kid: `management-e2e-${revisionSuffix}`, jwk: publicJwk }),
    },
  );
  const listedKeys = await platformManagement(
    `credentials/${additionalCredential.credential.id}/public-keys`,
  );
  if (!listedKeys.some(key => key.id === registeredKey.id && key.jwk.kty === 'RSA')) {
    throw new Error('Registered public JWK was not returned by the read endpoint');
  }
  const clonedCredential = await platformManagement(
    `apps/${managedRegistration.application.id}/credentials`,
    {
      method: 'POST',
      body: JSON.stringify({ sourceCredentialId: additionalCredential.credential.id }),
    },
  );
  const clonedDetail = await platformManagement(
    `credentials/${clonedCredential.credential.id}`,
  );
  if (
    clonedCredential.credential.consumerKey === additionalCredential.credential.consumerKey
    || clonedCredential.consumerSecret === rotation.consumerSecret
    || clonedDetail.publicKeys.length !== 0
    || clonedDetail.certificates.length !== 0
    || clonedDetail.productGrants.length !== 1
  ) {
    throw new Error('Credential cloning copied identity material or omitted approved grants');
  }
  const revokedKey = await platformManagement(
    `public-keys/${registeredKey.id}/revoke`,
    { method: 'POST' },
  );
  if (revokedKey.status !== 'revoked') {
    throw new Error('Public JWK revocation did not persist');
  }

  await platformManagement(`apps/${managedRegistration.application.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: `Renamed management app ${revisionSuffix}` }),
  });
  await platformManagement(`credentials/${additionalCredential.credential.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'revoked' }),
  });
  const deniedRevokedCredential = await gatewayCurl([
    '--header',
    `x-api-key: ${additionalCredential.credential.consumerKey}`,
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/api-key`,
  ]);
  if (deniedRevokedCredential.stdout !== '401') {
    throw new Error('Revoked credential remained usable as an API key');
  }
  const auditEvents = await platformManagement(
    `audit-events?organizationId=org-bank-dev&resourceId=${additionalCredential.credential.id}&limit=50`,
  );
  const auditedActions = new Set(auditEvents.items.map(event => event.action));
  for (const action of [
    'credential.create',
    'credential.rotateSecret',
    'credential.replaceProductGrants',
    'credential.update',
  ]) {
    if (!auditedActions.has(action)) {
      throw new Error(`Management mutation was not audited: ${action}`);
    }
  }
  const workflowAuditEvents = await platformManagement(
    'audit-events?organizationId=org-bank-dev&limit=200',
  );
  const workflowActions = new Set(workflowAuditEvents.items.map(event => event.action));
  for (const action of ['credential.updateConsumerKey', 'credential.clone']) {
    if (!workflowActions.has(action)) {
      throw new Error(`Credential workflow was not audited: ${action}`);
    }
  }

  const retiredDeployment = await platformManagement(
    `proxy-deployments/${authenticatedDeployment.deployment.id}/retire`,
    { method: 'POST' },
  );
  if (retiredDeployment.deployment.status !== 'retired') {
    throw new Error('Active deployment retirement did not preserve the runtime contract');
  }
  await waitForRuntimeSync(retiredDeployment);
  const retiredRoute = await gatewayCurl([
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/api-key`,
  ]);
  if (retiredRoute.stdout !== '404') {
    throw new Error('Retired deployment remained in the gateway registry');
  }

  const authority = await platformManagement(
    'organizations/org-bank-dev/certificate-authorities/managed',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Platform E2E ${Date.now()}`,
        validityDays: 365,
      }),
    },
  );
  await platformManagement(
    `certificate-authorities/${authority.id}/active`,
    { method: 'POST' },
  );

  const generated = await generateClientKeyAndCsr({
    clientsDirectory: workDirectory,
    credentialId: `e2e-${Date.now()}`,
    algorithm: 'ec',
  });
  const certificate = await platformManagement(
    'credentials/cred-bank-001/certificates/issue',
    {
      method: 'POST',
      body: JSON.stringify({
        authorityId: authority.id,
        csrPem: await readFile(generated.csrFile, 'utf8'),
        validityDays: 1,
      }),
    },
  );
  const downloaded = await platformManagement(
    `certificates/${certificate.id}/download`,
  );
  const certificateFile = path.join(workDirectory, 'client.crt');
  await writeFile(certificateFile, downloaded.certificatePem, { mode: 0o644 });

  await new Promise(resolve => setTimeout(resolve, 1_500));
  const accepted = await mtlsRequest(certificateFile, generated.keyFile);
  if (accepted.status !== '200') {
    throw new Error(`Newly issued client certificate was not accepted: ${JSON.stringify(accepted)}`);
  }

  await platformManagement(`certificates/${certificate.id}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'keyCompromise' }),
  });
  let revoked = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await mtlsRequest(certificateFile, generated.keyFile);
    if (result.status === '000' || (result.exitCode !== 0 && !result.status)) {
      revoked = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!revoked) {
    throw new Error('Envoy did not reject the revoked certificate after SDS reload');
  }

  const replacement = await platformManagement(
    `certificate-authorities/${authority.id}/rotate`,
    { method: 'POST' },
  );
  await exec('docker', composeArguments(
    'restart',
    'management-api',
  ), { cwd: root });
  await waitForManagement(await currentPlatformAccessToken(true));
  const authorities = await platformManagement(
    'organizations/org-bank-dev/certificate-authorities',
  );
  if (!authorities.some(item => item.id === replacement.id && item.status === 'active')) {
    throw new Error('Rotated authority did not persist after Management API restart');
  }

  const secondClient = path.join(secrets, 'clients/cred-bank-002');
  const unaffected = await mtlsRequest(
    path.join(secondClient, 'client.crt'),
    path.join(secondClient, 'client.key'),
  );
  if (unaffected.status !== '200') {
    throw new Error('An unrelated mTLS client stopped working');
  }

  console.log('Platform revisions, OIDC, OAuth, PKI and persistence checks passed');
} finally {
  await rm(workDirectory, { recursive: true, force: true });
}
