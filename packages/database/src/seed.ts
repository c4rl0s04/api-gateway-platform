import {
  DeploymentRegion,
  DeploymentStage,
  PrismaClient,
} from './generated';

const prisma = new PrismaClient();
const DEV_UPSTREAM_BASE_URL =
  process.env.DEV_UPSTREAM_BASE_URL ?? 'http://localhost:4000';

const ORGANIZATIONS = [
  { id: 'org-platform', name: 'API Gateway Platform' },
  { id: 'org-bank-dev', name: 'Bank Corp (Dev)' },
  { id: 'org-log-dev', name: 'Logistics Inc (Dev)' },
  { id: 'org-ecom-dev', name: 'E-Commerce Group (Dev)' },
  { id: 'org-health-dev', name: 'HealthCare GmbH (Dev)' },
  { id: 'org-id-dev', name: 'Identity Services (Dev)' },
  { id: 'org-iot-dev', name: 'IoT Systems (Dev)' },
  { id: 'org-stream-dev', name: 'Streaming Brazil (Dev)' },
  { id: 'org-game-dev', name: 'Gaming Korea (Dev)' },
];

const DEPLOYMENT_STAGES = [
  DeploymentStage.qual,
  DeploymentStage.pprod,
  DeploymentStage.prod,
];

const DEPLOYMENT_REGIONS = Object.values(DeploymentRegion);

function environmentId(
  stage: DeploymentStage,
  region: DeploymentRegion,
): string {
  return `env-${stage}-${region}`;
}

function environmentPublicOrigin(
  stage: DeploymentStage,
  region: DeploymentRegion,
): string {
  return `https://${stage}-${region}.gateway.localhost:8443`;
}

const ENVIRONMENTS = DEPLOYMENT_REGIONS.flatMap(region =>
  DEPLOYMENT_STAGES.map(stage => ({
    id: environmentId(stage, region),
    stage,
    region,
    publicOrigin: environmentPublicOrigin(stage, region),
  })),
);

const PROXIES = [
  {
    id: 'proxy-es-banking',
    name: 'ES Banking',
    basePath: '/es/banking/v1',
    organizationId: 'org-bank-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.es,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-esb-health', path: '/health', targetPath: '/health' },
      { id: 'ep-esb-accounts', path: '/accounts', targetPath: '/accounts' },
      { id: 'ep-esb-acc-id', path: '/accounts/:id', targetPath: '/accounts/:id' },
    ],
  },
  {
    id: 'proxy-us-banking',
    name: 'US Banking',
    basePath: '/us/banking/v2',
    organizationId: 'org-bank-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.us,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-usb-ping', path: '/ping', targetPath: '/ping' },
      { id: 'ep-usb-cards', path: '/cards', targetPath: '/cards' },
      { id: 'ep-usb-card-id', path: '/cards/:id', targetPath: '/cards/:id' },
    ],
  },
  {
    id: 'proxy-uk-logistics',
    name: 'UK Logistics',
    basePath: '/uk/logistics/v1',
    organizationId: 'org-log-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.uk,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-ukl-health', path: '/health', targetPath: '/health' },
      { id: 'ep-ukl-shipments', path: '/shipments', targetPath: '/shipments' },
      { id: 'ep-ukl-ship-id', path: '/shipments/:id', targetPath: '/shipments/:id' },
    ],
  },
  {
    id: 'proxy-fr-ecommerce',
    name: 'FR E-commerce',
    basePath: '/fr/ecommerce/v1',
    organizationId: 'org-ecom-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.fr,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-fre-ping', path: '/ping', targetPath: '/ping' },
      { id: 'ep-fre-products', path: '/products', targetPath: '/products' },
      { id: 'ep-fre-product-id', path: '/products/:id', targetPath: '/products/:id' },
    ],
  },
  {
    id: 'proxy-es-ecommerce',
    name: 'ES E-commerce',
    basePath: '/es/ecommerce/v2',
    organizationId: 'org-ecom-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.es,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-ese-health', path: '/health', targetPath: '/health' },
      { id: 'ep-ese-orders', path: '/orders', targetPath: '/orders' },
      { id: 'ep-ese-order-id', path: '/orders/:id', targetPath: '/orders/:id' },
    ],
  },
  {
    id: 'proxy-de-healthcare',
    name: 'DE Healthcare',
    basePath: '/de/healthcare/v1',
    organizationId: 'org-health-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.de,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-deh-ping', path: '/ping', targetPath: '/ping' },
      { id: 'ep-deh-patients', path: '/patients', targetPath: '/patients' },
      { id: 'ep-deh-patient-id', path: '/patients/:id', targetPath: '/patients/:id' },
    ],
  },
  {
    id: 'proxy-us-identity',
    name: 'US Identity',
    basePath: '/us/identity/v1',
    organizationId: 'org-id-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.us,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-usi-health', path: '/health', targetPath: '/health' },
      { id: 'ep-usi-users', path: '/users', targetPath: '/users' },
      { id: 'ep-usi-user-id', path: '/users/:id', targetPath: '/users/:id' },
    ],
  },
  {
    id: 'proxy-jp-iot',
    name: 'JP IoT',
    basePath: '/jp/iot/v1',
    organizationId: 'org-iot-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.jp,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-jpi-ping', path: '/ping', targetPath: '/ping' },
      { id: 'ep-jpi-devices', path: '/devices', targetPath: '/devices' },
      { id: 'ep-jpi-device-id', path: '/devices/:id', targetPath: '/devices/:id' },
    ],
  },
  {
    id: 'proxy-br-streaming',
    name: 'BR Streaming',
    basePath: '/br/streaming/v1',
    organizationId: 'org-stream-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.br,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-brs-health', path: '/health', targetPath: '/health' },
      { id: 'ep-brs-catalog', path: '/catalog', targetPath: '/catalog' },
      { id: 'ep-brs-catalog-id', path: '/catalog/:id', targetPath: '/catalog/:id' },
    ],
  },
  {
    id: 'proxy-kr-gaming',
    name: 'KR Gaming',
    basePath: '/kr/gaming/v1',
    organizationId: 'org-game-dev',
    deployment: {
      environmentId: environmentId(
        DeploymentStage.qual,
        DeploymentRegion.kr,
      ),
      upstreamBaseUrl: DEV_UPSTREAM_BASE_URL,
    },
    endpoints: [
      { id: 'ep-krg-ping', path: '/ping', targetPath: '/ping' },
      { id: 'ep-krg-leaderboards', path: '/leaderboards', targetPath: '/leaderboards' },
      { id: 'ep-krg-leaderboard-id', path: '/leaderboards/:id', targetPath: '/leaderboards/:id' },
    ],
  },
];

async function main() {
  console.log('Starting base seed...');

  for (const organization of ORGANIZATIONS) {
    await prisma.organization.upsert({
      where: { id: organization.id },
      update: { name: organization.name },
      create: organization,
    });
  }

  for (const environment of ENVIRONMENTS) {
    await prisma.environment.upsert({
      where: { id: environment.id },
      update: {
        stage: environment.stage,
        region: environment.region,
        publicOrigin: environment.publicOrigin,
      },
      create: environment,
    });
  }

  for (const proxy of PROXIES) {
    const { endpoints, deployment, ...proxyData } = proxy;

    await prisma.apiProxy.upsert({
      where: { id: proxyData.id },
      update: {
        name: proxyData.name,
        basePath: proxyData.basePath,
        active: true,
        organizationId: proxyData.organizationId,
      },
      create: {
        ...proxyData,
        active: true,
      },
    });

    for (const endpoint of endpoints) {
      await prisma.endpoint.upsert({
        where: { id: endpoint.id },
        update: {
          path: endpoint.path,
          targetPath: endpoint.targetPath,
        },
        create: {
          ...endpoint,
          proxyId: proxy.id,
        },
      });
    }

    await prisma.proxyDeployment.upsert({
      where: {
        proxyId_environmentId: {
          proxyId: proxy.id,
          environmentId: deployment.environmentId,
        },
      },
      update: {
        upstreamBaseUrl: deployment.upstreamBaseUrl,
        active: true,
      },
      create: {
        id: `deployment-${proxy.id}-qual`,
        proxyId: proxy.id,
        environmentId: deployment.environmentId,
        upstreamBaseUrl: deployment.upstreamBaseUrl,
        active: true,
      },
    });
  }

  await prisma.apiProxy.upsert({
    where: { id: 'proxy-platform-oauth' },
    update: {
      name: 'Platform OAuth',
      basePath: '/oauth',
      active: true,
      systemManaged: true,
      organizationId: 'org-platform',
    },
    create: {
      id: 'proxy-platform-oauth',
      name: 'Platform OAuth',
      basePath: '/oauth',
      active: true,
      systemManaged: true,
      organizationId: 'org-platform',
    },
  });
  for (const endpoint of [
    { id: 'ep-oauth-token', path: '/token' },
    { id: 'ep-oauth-jwks', path: '/.well-known/jwks.json' },
  ]) {
    await prisma.endpoint.upsert({
      where: { id: endpoint.id },
      update: { path: endpoint.path, mode: 'local', targetPath: null },
      create: {
        ...endpoint,
        mode: 'local',
        targetPath: null,
        proxyId: 'proxy-platform-oauth',
      },
    });
  }
  for (const environment of ENVIRONMENTS) {
    await prisma.proxyDeployment.upsert({
      where: {
        proxyId_environmentId: {
          proxyId: 'proxy-platform-oauth',
          environmentId: environment.id,
        },
      },
      update: { upstreamBaseUrl: null, active: true },
      create: {
        id: `deployment-oauth-${environment.stage}-${environment.region}`,
        proxyId: 'proxy-platform-oauth',
        environmentId: environment.id,
        upstreamBaseUrl: null,
        active: true,
      },
    });
  }

  console.log(`${ORGANIZATIONS.length} organizations`);
  console.log(`${ENVIRONMENTS.length} closed-choice environments`);
  console.log(`${PROXIES.length} logical proxies with QUAL deployments`);
  console.log(`Platform OAuth proxy deployed to ${ENVIRONMENTS.length} environments`);
}

main()
  .catch(error => {
    console.error('Base seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
