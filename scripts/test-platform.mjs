#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateClientKeyAndCsr } from '../packages/pki/dist/index.js';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const secrets = path.join(root, '.local-secrets');
const composeEnvironment = path.join(secrets, 'compose.env');
const usersEnvironment = path.join(secrets, 'keycloak/users.env');
const keycloakBaseUrl = 'http://localhost:8081';
const adminPanelBaseUrl = 'http://localhost:8080';
const qualEsGatewayOrigin = 'https://qual-es.gateway.localhost:8443';
const workDirectory = await mkdtemp(path.join(os.tmpdir(), 'gateway-platform-e2e-'));

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
      cookie: `management_access_token=${token}`,
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

async function restartGateway() {
  await exec('docker', [
    'compose',
    '--env-file',
    composeEnvironment,
    'restart',
    'gateway',
  ], { cwd: root });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await gatewayCurl([
        '--output',
        '/dev/null',
        '--write-out',
        '%{http_code}',
        `${qualEsGatewayOrigin}/oauth/.well-known/jwks.json`,
      ]);
      if (response.stdout === '200') return;
    } catch {
      // Envoy may briefly observe the gateway restart.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Gateway did not become ready after restart');
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
  if (!firstDeployment.runtimeRefreshRequired) {
    throw new Error('Deployment did not report the required runtime restart');
  }
  await restartGateway();
  const revisionOneResponse = await gatewayCurl([
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/revision-one`,
  ]);
  if (revisionOneResponse.stdout !== '200') {
    throw new Error('Gateway did not load revision 1 after restart');
  }

  const revision2 = await importRevision('getRevisionTwo', '/revision-two');
  await deployRevision(revision2.revisionNumber);
  await restartGateway();
  const revisionTwoResponse = await gatewayCurl([
    '--output', '/dev/null', '--write-out', '%{http_code}',
    `${qualEsGatewayOrigin}${revisionBasePath}/revision-two`,
  ]);
  if (revisionTwoResponse.stdout !== '200') {
    throw new Error('Gateway did not load revision 2 after restart');
  }

  await deployRevision(revision1.revisionNumber);
  await restartGateway();
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
  const prodOrigin = 'https://prod-es.gateway.localhost:8443';
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
    'https://localhost:8443/oauth/.well-known/jwks.json',
  ]);
  if (unknownEnvironment.stdout !== '421') {
    throw new Error('An unknown gateway environment host was not rejected');
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
  await exec('docker', [
    'compose',
    '--env-file',
    composeEnvironment,
    'restart',
    'management-api',
  ], { cwd: root });
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
