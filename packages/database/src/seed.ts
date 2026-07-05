import { PrismaClient } from './generated';

const prisma = new PrismaClient();

// ─── Datos de seed ────────────────────────────────────────────────────────────

const ORGANIZATIONS = [
  { id: 'org-bank-dev',   name: 'Bank Corp (Dev)' },
  { id: 'org-log-dev',    name: 'Logistics Inc (Dev)' },
  { id: 'org-ecom-dev',   name: 'E-Commerce Group (Dev)' },
  { id: 'org-health-dev', name: 'HealthCare GmbH (Dev)' },
  { id: 'org-id-dev',     name: 'Identity Services (Dev)' },
  { id: 'org-iot-dev',    name: 'IoT Systems (Dev)' },
  { id: 'org-stream-dev', name: 'Streaming Brazil (Dev)' },
  { id: 'org-game-dev',   name: 'Gaming Korea (Dev)' },
];

// Un entorno "dev" por organización con ID determinista para idempotencia
const ENVIRONMENTS = ORGANIZATIONS.map(org => ({
  id:             `${org.id}-env-dev`,
  name:           'dev',
  organizationId: org.id,
}));

// Espejo exacto de DEV_SEED_PROXIES que vivía en server.ts
const PROXIES = [
  {
    id: 'proxy-es-banking', name: 'ES Banking', basePath: '/es/banking/v1',
    environmentId: 'org-bank-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-esb-health',   path: '/health',       targetUrl: 'http://localhost:4000/health' },
      { id: 'ep-esb-accounts', path: '/accounts',     targetUrl: 'http://localhost:4000/accounts' },
      { id: 'ep-esb-acc-id',   path: '/accounts/:id', targetUrl: 'http://localhost:4000/accounts/:id' },
    ],
  },
  {
    id: 'proxy-us-banking', name: 'US Banking', basePath: '/us/banking/v2',
    environmentId: 'org-bank-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-usb-ping',    path: '/ping',      targetUrl: 'http://localhost:4000/ping' },
      { id: 'ep-usb-cards',   path: '/cards',     targetUrl: 'http://localhost:4000/cards' },
      { id: 'ep-usb-card-id', path: '/cards/:id', targetUrl: 'http://localhost:4000/cards/:id' },
    ],
  },
  {
    id: 'proxy-uk-logistics', name: 'UK Logistics', basePath: '/uk/logistics/v1',
    environmentId: 'org-log-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-ukl-health',    path: '/health',        targetUrl: 'http://localhost:4000/health' },
      { id: 'ep-ukl-shipments', path: '/shipments',     targetUrl: 'http://localhost:4000/shipments' },
      { id: 'ep-ukl-ship-id',   path: '/shipments/:id', targetUrl: 'http://localhost:4000/shipments/:id' },
    ],
  },
  {
    id: 'proxy-fr-ecommerce', name: 'FR E-commerce', basePath: '/fr/ecommerce/v1',
    environmentId: 'org-ecom-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-fre-ping',       path: '/ping',         targetUrl: 'http://localhost:4000/ping' },
      { id: 'ep-fre-products',   path: '/products',     targetUrl: 'http://localhost:4000/products' },
      { id: 'ep-fre-product-id', path: '/products/:id', targetUrl: 'http://localhost:4000/products/:id' },
    ],
  },
  {
    id: 'proxy-es-ecommerce', name: 'ES E-commerce', basePath: '/es/ecommerce/v2',
    environmentId: 'org-ecom-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-ese-health',   path: '/health',    targetUrl: 'http://localhost:4000/health' },
      { id: 'ep-ese-orders',   path: '/orders',    targetUrl: 'http://localhost:4000/orders' },
      { id: 'ep-ese-order-id', path: '/orders/:id',targetUrl: 'http://localhost:4000/orders/:id' },
    ],
  },
  {
    id: 'proxy-de-healthcare', name: 'DE Healthcare', basePath: '/de/healthcare/v1',
    environmentId: 'org-health-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-deh-ping',       path: '/ping',         targetUrl: 'http://localhost:4000/ping' },
      { id: 'ep-deh-patients',   path: '/patients',     targetUrl: 'http://localhost:4000/patients' },
      { id: 'ep-deh-patient-id', path: '/patients/:id', targetUrl: 'http://localhost:4000/patients/:id' },
    ],
  },
  {
    id: 'proxy-us-identity', name: 'US Identity', basePath: '/us/identity/v1',
    environmentId: 'org-id-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-usi-health',  path: '/health',   targetUrl: 'http://localhost:4000/health' },
      { id: 'ep-usi-users',   path: '/users',    targetUrl: 'http://localhost:4000/users' },
      { id: 'ep-usi-user-id', path: '/users/:id',targetUrl: 'http://localhost:4000/users/:id' },
    ],
  },
  {
    id: 'proxy-jp-iot', name: 'JP IoT', basePath: '/jp/iot/v1',
    environmentId: 'org-iot-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-jpi-ping',      path: '/ping',        targetUrl: 'http://localhost:4000/ping' },
      { id: 'ep-jpi-devices',   path: '/devices',     targetUrl: 'http://localhost:4000/devices' },
      { id: 'ep-jpi-device-id', path: '/devices/:id', targetUrl: 'http://localhost:4000/devices/:id' },
    ],
  },
  {
    id: 'proxy-br-streaming', name: 'BR Streaming', basePath: '/br/streaming/v1',
    environmentId: 'org-stream-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-brs-health',      path: '/health',      targetUrl: 'http://localhost:4000/health' },
      { id: 'ep-brs-catalog',     path: '/catalog',     targetUrl: 'http://localhost:4000/catalog' },
      { id: 'ep-brs-catalog-id',  path: '/catalog/:id', targetUrl: 'http://localhost:4000/catalog/:id' },
    ],
  },
  {
    id: 'proxy-kr-gaming', name: 'KR Gaming', basePath: '/kr/gaming/v1',
    environmentId: 'org-game-dev-env-dev', active: true,
    endpoints: [
      { id: 'ep-krg-ping',            path: '/ping',            targetUrl: 'http://localhost:4000/ping' },
      { id: 'ep-krg-leaderboards',    path: '/leaderboards',    targetUrl: 'http://localhost:4000/leaderboards' },
      { id: 'ep-krg-leaderboard-id',  path: '/leaderboards/:id',targetUrl: 'http://localhost:4000/leaderboards/:id' },
    ],
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting seed...');

  for (const org of ORGANIZATIONS) {
    await prisma.organization.upsert({
      where:  { id: org.id },
      update: { name: org.name },
      create: org,
    });
  }
  console.log(`✓ ${ORGANIZATIONS.length} organizations`);

  for (const env of ENVIRONMENTS) {
    await prisma.environment.upsert({
      where:  { id: env.id },
      update: {},
      create: env,
    });
  }
  console.log(`✓ ${ENVIRONMENTS.length} environments`);

  for (const proxy of PROXIES) {
    const { endpoints, ...proxyData } = proxy;

    await prisma.apiProxy.upsert({
      where:  { id: proxyData.id },
      update: { name: proxyData.name, active: proxyData.active },
      create: proxyData,
    });

    for (const ep of endpoints) {
      await prisma.endpoint.upsert({
        where:  { id: ep.id },
        update: { path: ep.path, targetUrl: ep.targetUrl },
        create: { ...ep, proxyId: proxy.id },
      });
    }
  }
  console.log(`✓ ${PROXIES.length} proxies with endpoints`);

  console.log('✅ Seed complete');
}

main()
  .catch(err => { console.error('❌ Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
