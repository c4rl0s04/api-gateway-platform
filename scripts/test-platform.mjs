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

async function waitFor(url, attempts = 40) {
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
  return request(`${adminPanelBaseUrl}/api/management/${route}`, {
    ...options,
    headers: {
      cookie: `management_access_token=${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
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
      'https://localhost:8443/es/banking/v1/health',
    ]);
    return { exitCode: 0, status: result.stdout };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      status: error.stdout ?? '',
    };
  }
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

  const platformIdentity = await tokenRequest('api-gateway', {
    grant_type: 'password',
    client_id: 'platform-e2e',
    username: 'platform-admin',
    password: users.PLATFORM_ADMIN_PASSWORD,
  });
  const accessToken = platformIdentity.access_token;
  const principal = await management(accessToken, 'me');
  if (!principal.memberships.some(membership => membership.role === 'platformAdmin')) {
    throw new Error('OIDC identity is not mapped to platformAdmin');
  }

  const authority = await management(
    accessToken,
    'organizations/org-bank-dev/certificate-authorities/managed',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Platform E2E ${Date.now()}`,
        validityDays: 365,
      }),
    },
  );
  await management(
    accessToken,
    `certificate-authorities/${authority.id}/active`,
    { method: 'POST' },
  );

  const generated = await generateClientKeyAndCsr({
    clientsDirectory: workDirectory,
    credentialId: `e2e-${Date.now()}`,
    algorithm: 'ec',
  });
  const certificate = await management(
    accessToken,
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
  const downloaded = await management(
    accessToken,
    `certificates/${certificate.id}/download`,
  );
  const certificateFile = path.join(workDirectory, 'client.crt');
  await writeFile(certificateFile, downloaded.certificatePem, { mode: 0o644 });

  await new Promise(resolve => setTimeout(resolve, 1_500));
  const accepted = await mtlsRequest(certificateFile, generated.keyFile);
  if (accepted.status !== '200') {
    throw new Error(`Newly issued client certificate was not accepted: ${JSON.stringify(accepted)}`);
  }

  await management(accessToken, `certificates/${certificate.id}/revoke`, {
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

  const replacement = await management(
    accessToken,
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
  await waitForManagement(accessToken);
  const authorities = await management(
    accessToken,
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

  console.log('Platform OIDC, issuance, revocation, rotation and persistence checks passed');
} finally {
  await rm(workDirectory, { recursive: true, force: true });
}
