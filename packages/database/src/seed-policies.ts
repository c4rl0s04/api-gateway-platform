import {
  AdminRole,
  AuthorizationStatus,
  CertificateAuthorityKind,
  CertificateAuthorityStatus,
  CertificateSource,
  PrismaClient,
} from './generated';
import { hashConsumerSecret } from './credentials.js';
import { importProxyRevision } from './proxy-revisions.js';
import { X509Certificate } from 'node:crypto';

const prisma = new PrismaClient();
const DEFAULT_DEV_CLIENT_PUBLIC_JWK = {
  kty: 'RSA',
  n: 'w7H7s7ANk9hYBcJY6cLOUqGCGj-UWapwAY09a4tcR9AgHR20RTH_h-XD8VXN-BPTmDWCNulTn4JJ0FFVRj3_pd3Y686cPLyz8Yl6IUSdDm4oYp-6fHzCf9lzH7UbuLvrUaAbJ3yCMg8HFRGTiBpgX8PCji5xHxRh2yumfHed7x4VGYJ3odGnzfD2rA1p4G-jjyAYD_6xAfBdnGP0vhPRp-9xn6P-qCDEelkbnChEvo6v9t8pvKd-3QnfvKFakjFFiy7gg4_XrqY10_sIMjtEFPOv2kW4Y71pxAfYfnDAd4KXSeyn-KT8tXO_-GMz8lTNUynol4FcER1z9YlecTGbdQ',
  e: 'AQAB',
};
const DEV_CLIENT_PUBLIC_JWK = process.env.DEV_CLIENT_PUBLIC_JWK
  ? JSON.parse(process.env.DEV_CLIENT_PUBLIC_JWK)
  : DEFAULT_DEV_CLIENT_PUBLIC_JWK;
const DEV_MTLS_CERT_FINGERPRINT = (
  process.env.DEV_MTLS_CERT_FINGERPRINT
  ?? '40256508874067631b709b5daf539b60b6b29dc1a5a5b377dc4e6a0c6d066997'
).toLowerCase();
const DEV_MTLS_CERT_FINGERPRINT_SECOND = (
  process.env.DEV_MTLS_CERT_FINGERPRINT_SECOND
  ?? '19c4408d7fd8db627c4c0f58e92464d789efc4987dba02f67f481004f7189d7e'
).toLowerCase();
const decodePem = (name: string): string | null =>
  process.env[name]
    ? Buffer.from(process.env[name]!, 'base64').toString('utf8')
    : null;
const DEV_MTLS_CA_CERTIFICATE = decodePem('DEV_MTLS_CA_CERTIFICATE_BASE64');
const DEV_MTLS_CRL = decodePem('DEV_MTLS_CRL_BASE64');
const DEV_MTLS_CLIENT_CERTIFICATE = decodePem('DEV_MTLS_CLIENT_CERTIFICATE_BASE64');
const DEV_MTLS_CLIENT_CERTIFICATE_SECOND = decodePem(
  'DEV_MTLS_CLIENT_CERTIFICATE_SECOND_BASE64',
);

// ─── API Products ─────────────────────────────────────────────────────────────
// Products bundle proxies into consumable units.
// A credential grants access to the proxies inside its linked products.

const API_PRODUCTS = [
  {
    id:             'product-banking-apis',
    name:           'Banking APIs',
    organizationId: 'org-bank-dev',
    // Proxies bundled into this product
    proxyIds:       ['proxy-es-banking', 'proxy-us-banking'],
    scopes:         ['banking:read'],
    // Empty means the product is available in every environment.
    environmentIds: [],
  },
  {
    id:             'product-identity-apis',
    name:           'Identity APIs',
    organizationId: 'org-id-dev',
    proxyIds:       ['proxy-us-identity'],
    scopes:         ['identity:read'],
    environmentIds: [],
  },
];

// ─── Developer Apps ───────────────────────────────────────────────────────────

const DEVELOPER_APPS = [
  {
    id:             'app-bank-partner',
    name:           'Bank Partner App',
    organizationId: 'org-bank-dev',
  },
  {
    id:             'app-id-service',
    name:           'Identity Service Consumer',
    organizationId: 'org-id-dev',
  },
  {
    id:             'app-bank-partner-secondary',
    name:           'Bank Partner Secondary App',
    organizationId: 'org-bank-dev',
  },
];

// ─── Credentials ──────────────────────────────────────────────────────────────
//
// DEV CREDENTIALS — use these in curl tests:
//   Bank Partner:     consumerKey = dev-bank-key-abc123
//   Identity Service: consumerKey = dev-id-key-def456
//
// Secrets are development-only fixtures. Only their scrypt hashes are stored.

const API_CREDENTIALS = [
  {
    id:             'cred-bank-001',
    appId:          'app-bank-partner',
    consumerKey:    'dev-bank-key-abc123',
    consumerSecret: 'dev-bank-secret-xyz789-0123456789abcdef',
    // This credential grants access to the Banking APIs product
    productIds:     ['product-banking-apis'],
    scopes:         ['banking:read'],
  },
  {
    id:             'cred-id-001',
    appId:          'app-id-service',
    consumerKey:    'dev-id-key-def456',
    consumerSecret: 'dev-id-secret-uvw321-0123456789abcdef',
    // This credential grants access to the Identity APIs product
    productIds:     ['product-identity-apis'],
    scopes:         ['identity:read'],
  },
  {
    id:             'cred-bank-002',
    appId:          'app-bank-partner-secondary',
    consumerKey:    'dev-bank-key-secondary',
    consumerSecret: 'dev-bank-secret-secondary-0123456789abcdef',
    productIds:     ['product-banking-apis'],
    scopes:         ['banking:read'],
  },
];

// ─── Endpoint Policies ────────────────────────────────────────────────────────
//
// Local development coverage:
//   - ep-oauth-token: rate-limit + oauth-token
//   - ep-oauth-jwks: jwks-endpoint
//   - ep-esb-accounts (/es/banking/v1/accounts): api-key-auth + rate-limit (5 req/min)
//   - ep-esb-acc-id  (/es/banking/v1/accounts/:id): oauth-access-token
//   - ep-esb-health  (/es/banking/v1/health): mtls-auth
//   - ep-usi-users    (/us/identity/v1/users):   api-key-auth only

const ENDPOINT_POLICIES = [
  {
    id:         'pol-oauth-token-ratelimit',
    endpointId: 'ep-oauth-token',
    type:       'rate-limit',
    order:      1,
    enabled:    true,
    config:     { limit: 30, windowSeconds: 60, failureMode: 'closed' },
  },
  {
    id:         'pol-oauth-token-issue',
    endpointId: 'ep-oauth-token',
    type:       'oauth-token',
    order:      2,
    enabled:    true,
    config: {
      failureMode: 'closed',
      grantTypes: [
        'client_credentials',
        'urn:ietf:params:oauth:grant-type:jwt-bearer',
      ],
      accessTokenTtlSeconds: 900,
      audience: 'api-gateway',
      allowedScopes: ['banking:read', 'identity:read'],
    },
  },
  {
    id:         'pol-oauth-jwks',
    endpointId: 'ep-oauth-jwks',
    type:       'jwks-endpoint',
    order:      1,
    enabled:    true,
    config:     { failureMode: 'closed' },
  },
  {
    id:         'pol-esb-acc-id-oauth',
    endpointId: 'ep-esb-acc-id',
    type:       'oauth-access-token',
    order:      1,
    enabled:    true,
    config: {
      failureMode: 'closed',
      audience: 'api-gateway',
      requiredScopes: ['banking:read'],
    },
  },
  {
    id:         'pol-esb-health-mtls',
    endpointId: 'ep-esb-health',
    type:       'mtls-auth',
    order:      1,
    enabled:    true,
    config:     { failureMode: 'closed' },
  },
  // ES Banking /accounts — api-key-auth first (order 1)
  {
    id:         'pol-esb-acc-apikey',
    endpointId: 'ep-esb-accounts',
    type:       'api-key-auth',
    order:      1,
    enabled:    true,
    config:     { header: 'x-api-key', failureMode: 'closed' },
  },
  // ES Banking /accounts — rate-limit second (order 2)
  // Low limit (5/min) for easy testing in development
  {
    id:         'pol-esb-acc-ratelimit',
    endpointId: 'ep-esb-accounts',
    type:       'rate-limit',
    order:      2,
    enabled:    true,
    config:     { limit: 5, windowSeconds: 60, failureMode: 'open' },
  },
  // US Identity /users — api-key-auth only
  {
    id:         'pol-usi-users-apikey',
    endpointId: 'ep-usi-users',
    type:       'api-key-auth',
    order:      1,
    enabled:    true,
    config:     { header: 'x-api-key', failureMode: 'closed' },
  },
];

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParameters(path: string) {
  return [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

async function seedProxyRevisions(): Promise<void> {
  const proxies = await prisma.apiProxy.findMany({
    include: {
      revisions: { select: { id: true, revisionNumber: true } },
      endpoints: {
        include: { policies: { orderBy: { order: 'asc' } } },
        orderBy: { path: 'asc' },
      },
    },
  });
  for (const proxy of proxies) {
    let revision = proxy.revisions.find(candidate => candidate.revisionNumber === 1);
    if (!revision) {
      if (!proxy.basePath) throw new Error(`Proxy ${proxy.id} has no legacy basePath`);
      const paths = Object.fromEntries(proxy.endpoints.map(endpoint => {
        const path = openApiPath(endpoint.path);
        const method = endpoint.id === 'ep-oauth-token' ? 'post' : 'get';
        return [path, {
          [method]: {
            operationId: endpoint.id,
            parameters: pathParameters(path),
            responses: { '200': { description: 'Development seed response' } },
          },
        }];
      }));
      const openapiSource = JSON.stringify({
        openapi: '3.1.0',
        info: { title: proxy.name, version: '1.0.0' },
        paths,
      }, null, 2);
      const gatewayConfigSource = JSON.stringify({
        apiVersion: 'gateway.platform/v1',
        basePath: proxy.basePath,
        operations: Object.fromEntries(proxy.endpoints.map(endpoint => [
          endpoint.id,
          {
            ...(endpoint.mode === 'local' ? { mode: 'local' } : {}),
            targetPath: endpoint.targetPath
              ? openApiPath(endpoint.targetPath)
              : undefined,
            policies: endpoint.policies.map(policy => ({
              type: policy.type,
              enabled: policy.enabled,
              config: policy.config,
            })),
          },
        ])),
      }, null, 2);
      const imported = await importProxyRevision({
        proxyId: proxy.id,
        openapiSource,
        gatewayConfigSource,
        allowSystemManaged: true,
        actor: {
          issuer: 'seed://local',
          subject: 'database-seed',
          role: AdminRole.platformAdmin,
        },
      });
      revision = { id: imported.id, revisionNumber: imported.revisionNumber };
    }
    await prisma.proxyDeployment.updateMany({
      where: { proxyId: proxy.id, revisionId: null },
      data: { revisionId: revision.id, status: 'active', active: true },
    });
  }
  console.log(`✓ ${proxies.length} immutable proxy revisions`);
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting policy seed (products, apps, credentials, policies)...');

  // 1. Create API Products and their optional environment restrictions.
  for (const product of API_PRODUCTS) {
    await prisma.apiProduct.upsert({
      where:  { id: product.id },
      update: {
        name: product.name,
        organizationId: product.organizationId,
        active: true,
        scopes: product.scopes,
        proxies:      { set: product.proxyIds.map(id => ({ id })) },
        environments: { set: product.environmentIds.map(id => ({ id })) },
      },
      create: {
        id:           product.id,
        name:         product.name,
        organizationId: product.organizationId,
        active: true,
        scopes: product.scopes,
        proxies:      { connect: product.proxyIds.map(id => ({ id })) },
        environments: { connect: product.environmentIds.map(id => ({ id })) },
      },
    });
  }
  console.log(`✓ ${API_PRODUCTS.length} API products`);

  // 2. Create Developer Apps
  for (const app of DEVELOPER_APPS) {
    await prisma.developerApp.upsert({
      where:  { id: app.id },
      update: {
        name: app.name,
        organizationId: app.organizationId,
      },
      create: app,
    });
  }
  console.log(`✓ ${DEVELOPER_APPS.length} developer apps`);

  const localIssuer = 'http://localhost:8081/realms/api-gateway';
  const memberships = [
    {
      id: 'membership-local-platform-admin',
      oidcSubject: 'local-platform-admin',
      role: AdminRole.platformAdmin,
      scopeKey: 'platform',
      organizationId: null,
      displayName: 'Local Platform Admin',
      email: 'platform-admin@local.test',
    },
    {
      id: 'membership-local-organization-admin',
      oidcSubject: 'local-organization-admin',
      role: AdminRole.organizationAdmin,
      scopeKey: 'org-bank-dev',
      organizationId: 'org-bank-dev',
      displayName: 'Local Organization Admin',
      email: 'organization-admin@local.test',
    },
    {
      id: 'membership-local-viewer',
      oidcSubject: 'local-viewer',
      role: AdminRole.viewer,
      scopeKey: 'org-bank-dev',
      organizationId: 'org-bank-dev',
      displayName: 'Local Viewer',
      email: 'viewer@local.test',
    },
  ];
  for (const membership of memberships) {
    await prisma.adminMembership.upsert({
      where: {
        oidcIssuer_oidcSubject_scopeKey: {
          oidcIssuer: localIssuer,
          oidcSubject: membership.oidcSubject,
          scopeKey: membership.scopeKey,
        },
      },
      update: {
        role: membership.role,
        organizationId: membership.organizationId,
        displayName: membership.displayName,
        email: membership.email,
        active: true,
      },
      create: {
        ...membership,
        oidcIssuer: localIssuer,
        active: true,
      },
    });
  }
  console.log(`✓ ${memberships.length} local OIDC memberships`);

  // 3. Create credentials and explicit approved product grants.
  for (const cred of API_CREDENTIALS) {
    const { productIds, scopes, consumerSecret, ...credData } = cred;
    const consumerSecretHash = await hashConsumerSecret(consumerSecret);
    await prisma.appCredential.upsert({
      where:  { id: cred.id },
      update: {
        appId:     cred.appId,
        consumerKey: cred.consumerKey,
        consumerSecretHash,
        status: AuthorizationStatus.approved,
      },
      create: {
        ...credData,
        consumerSecretHash,
        status: AuthorizationStatus.approved,
      },
    });

    for (const productId of productIds) {
      await prisma.credentialProductGrant.upsert({
        where: {
          credentialId_productId: {
            credentialId: cred.id,
            productId,
          },
        },
        update: { status: AuthorizationStatus.approved, scopes },
        create: {
          credentialId: cred.id,
          productId,
          status: AuthorizationStatus.approved,
          scopes,
        },
      });
    }
  }
  console.log(`✓ ${API_CREDENTIALS.length} API credentials`);

  if (DEV_MTLS_CA_CERTIFICATE) {
    const certificate = new X509Certificate(DEV_MTLS_CA_CERTIFICATE);
    await prisma.certificateAuthority.upsert({
      where: { id: 'ca-local-development' },
      update: {
        certificatePem: DEV_MTLS_CA_CERTIFICATE,
        fingerprintSha256: certificate.fingerprint256.replaceAll(':', '').toLowerCase(),
        subject: certificate.subject,
        serialNumber: certificate.serialNumber.toLowerCase(),
        validFrom: new Date(certificate.validFrom),
        expiresAt: new Date(certificate.validTo),
        crlPem: DEV_MTLS_CRL,
        crlThisUpdate: DEV_MTLS_CRL ? new Date() : null,
        crlNextUpdate: DEV_MTLS_CRL
          ? new Date(Date.now() + 6 * 86_400_000)
          : null,
        status: CertificateAuthorityStatus.active,
        isDefaultIssuer: true,
        keyRef: 'authorities/local-development',
      },
      create: {
        id: 'ca-local-development',
        organizationId: 'org-bank-dev',
        name: 'Local Development CA',
        kind: CertificateAuthorityKind.managed,
        status: CertificateAuthorityStatus.active,
        isDefaultIssuer: true,
        certificatePem: DEV_MTLS_CA_CERTIFICATE,
        fingerprintSha256: certificate.fingerprint256.replaceAll(':', '').toLowerCase(),
        subject: certificate.subject,
        serialNumber: certificate.serialNumber.toLowerCase(),
        validFrom: new Date(certificate.validFrom),
        expiresAt: new Date(certificate.validTo),
        keyRef: 'authorities/local-development',
        crlPem: DEV_MTLS_CRL,
        crlThisUpdate: DEV_MTLS_CRL ? new Date() : null,
        crlNextUpdate: DEV_MTLS_CRL
          ? new Date(Date.now() + 6 * 86_400_000)
          : null,
      },
    });
  }

  await prisma.appPublicKey.upsert({
    where: {
      credentialId_kid: {
        credentialId: 'cred-bank-001',
        kid: 'dev-bank-jwt-1',
      },
    },
    update: {
      status: AuthorizationStatus.approved,
      jwk: DEV_CLIENT_PUBLIC_JWK,
    },
    create: {
      id: 'public-key-bank-dev-1',
      credentialId: 'cred-bank-001',
      kid: 'dev-bank-jwt-1',
      jwk: DEV_CLIENT_PUBLIC_JWK,
      status: AuthorizationStatus.approved,
    },
  });
  await prisma.appCertificate.upsert({
    where: { id: 'certificate-bank-dev-1' },
    update: {
      fingerprintSha256: DEV_MTLS_CERT_FINGERPRINT,
      ...(DEV_MTLS_CLIENT_CERTIFICATE
        ? {
            authorityId: 'ca-local-development',
            certificatePem: DEV_MTLS_CLIENT_CERTIFICATE,
            source: CertificateSource.managed,
            serialNumber: new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).serialNumber.toLowerCase(),
            subject: new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).subject,
            issuer: new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).issuer,
            validFrom: new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).validFrom),
            expiresAt: new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).validTo),
          }
        : {}),
      status: AuthorizationStatus.approved,
    },
    create: {
      id: 'certificate-bank-dev-1',
      credentialId: 'cred-bank-001',
      fingerprintSha256: DEV_MTLS_CERT_FINGERPRINT,
      authorityId: DEV_MTLS_CLIENT_CERTIFICATE ? 'ca-local-development' : null,
      certificatePem: DEV_MTLS_CLIENT_CERTIFICATE,
      source: DEV_MTLS_CLIENT_CERTIFICATE
        ? CertificateSource.managed
        : CertificateSource.legacy,
      serialNumber: DEV_MTLS_CLIENT_CERTIFICATE
        ? new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).serialNumber.toLowerCase()
        : 'DEV-001',
      subject: DEV_MTLS_CLIENT_CERTIFICATE
        ? new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).subject
        : 'CN=Bank Partner Development',
      issuer: DEV_MTLS_CLIENT_CERTIFICATE
        ? new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).issuer
        : 'CN=Development CA',
      validFrom: DEV_MTLS_CLIENT_CERTIFICATE
        ? new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).validFrom)
        : undefined,
      expiresAt: DEV_MTLS_CLIENT_CERTIFICATE
        ? new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE).validTo)
        : null,
      status: AuthorizationStatus.approved,
    },
  });
  await prisma.appCertificate.upsert({
    where: { id: 'certificate-bank-dev-2' },
    update: {
      fingerprintSha256: DEV_MTLS_CERT_FINGERPRINT_SECOND,
      ...(DEV_MTLS_CLIENT_CERTIFICATE_SECOND
        ? {
            authorityId: 'ca-local-development',
            certificatePem: DEV_MTLS_CLIENT_CERTIFICATE_SECOND,
            source: CertificateSource.managed,
            serialNumber: new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).serialNumber.toLowerCase(),
            subject: new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).subject,
            issuer: new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).issuer,
            validFrom: new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).validFrom),
            expiresAt: new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).validTo),
          }
        : {}),
      status: AuthorizationStatus.approved,
    },
    create: {
      id: 'certificate-bank-dev-2',
      credentialId: 'cred-bank-002',
      fingerprintSha256: DEV_MTLS_CERT_FINGERPRINT_SECOND,
      authorityId: DEV_MTLS_CLIENT_CERTIFICATE_SECOND ? 'ca-local-development' : null,
      certificatePem: DEV_MTLS_CLIENT_CERTIFICATE_SECOND,
      source: DEV_MTLS_CLIENT_CERTIFICATE_SECOND
        ? CertificateSource.managed
        : CertificateSource.legacy,
      serialNumber: DEV_MTLS_CLIENT_CERTIFICATE_SECOND
        ? new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).serialNumber.toLowerCase()
        : 'DEV-002',
      subject: DEV_MTLS_CLIENT_CERTIFICATE_SECOND
        ? new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).subject
        : 'CN=Bank Partner Secondary',
      issuer: DEV_MTLS_CLIENT_CERTIFICATE_SECOND
        ? new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).issuer
        : 'CN=Development CA',
      validFrom: DEV_MTLS_CLIENT_CERTIFICATE_SECOND
        ? new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).validFrom)
        : undefined,
      expiresAt: DEV_MTLS_CLIENT_CERTIFICATE_SECOND
        ? new Date(new X509Certificate(DEV_MTLS_CLIENT_CERTIFICATE_SECOND).validTo)
        : null,
      status: AuthorizationStatus.approved,
    },
  });

  // 4. Create Endpoint Policies
  for (const policy of ENDPOINT_POLICIES) {
    await prisma.endpointPolicy.upsert({
      where:  { id: policy.id },
      update: {
        endpointId: policy.endpointId,
        type: policy.type,
        order: policy.order,
        enabled: policy.enabled,
        config: policy.config,
      },
      create: policy,
    });
  }
  console.log(`✓ ${ENDPOINT_POLICIES.length} endpoint policies`);

  // Compile the legacy seed catalog into immutable revision 1 bundles.
  await seedProxyRevisions();

  console.log('');
  console.log('✅ Policy seed complete');
  console.log('');
  console.log('Product → Proxy mapping:');
  console.log('  Banking APIs  → ES Banking, US Banking');
  console.log('  Identity APIs → US Identity');
}

main()
  .catch(err => { console.error('❌ Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
