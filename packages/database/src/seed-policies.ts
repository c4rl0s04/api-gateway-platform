import {
  AuthorizationStatus,
  CredentialAuthMethod,
  PrismaClient,
} from './generated';
import { hashConsumerSecret } from './credentials.js';

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
    authMethods:    [
      CredentialAuthMethod.apiKey,
      CredentialAuthMethod.clientSecret,
      CredentialAuthMethod.jwtBearer,
      CredentialAuthMethod.mtls,
    ],
    // This credential grants access to the Banking APIs product
    productIds:     ['product-banking-apis'],
    scopes:         ['banking:read'],
  },
  {
    id:             'cred-id-001',
    appId:          'app-id-service',
    consumerKey:    'dev-id-key-def456',
    consumerSecret: 'dev-id-secret-uvw321-0123456789abcdef',
    authMethods:    [
      CredentialAuthMethod.apiKey,
      CredentialAuthMethod.clientSecret,
    ],
    // This credential grants access to the Identity APIs product
    productIds:     ['product-identity-apis'],
    scopes:         ['identity:read'],
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
        authMethods: cred.authMethods,
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
      status: AuthorizationStatus.approved,
    },
    create: {
      id: 'certificate-bank-dev-1',
      credentialId: 'cred-bank-001',
      fingerprintSha256: DEV_MTLS_CERT_FINGERPRINT,
      serialNumber: 'DEV-001',
      subject: 'CN=Bank Partner Development',
      issuer: 'CN=Development CA',
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
