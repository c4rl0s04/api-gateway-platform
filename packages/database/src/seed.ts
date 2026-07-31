import {
  DeploymentRegion,
  DeploymentStage,
  PrismaClient,
} from './generated';

const prisma = new PrismaClient();

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

export const ENVIRONMENTS = DEPLOYMENT_REGIONS.flatMap(region =>
  DEPLOYMENT_STAGES.map(stage => ({
    id: environmentId(stage, region),
    stage,
    region,
    publicOrigin: environmentPublicOrigin(stage, region),
  })),
);

export const PROXIES = [
  { id: 'proxy-es-banking', name: 'ES Banking', organizationId: 'org-bank-dev' },
  { id: 'proxy-us-banking', name: 'US Banking', organizationId: 'org-bank-dev' },
  { id: 'proxy-uk-logistics', name: 'UK Logistics', organizationId: 'org-log-dev' },
  { id: 'proxy-fr-ecommerce', name: 'FR E-commerce', organizationId: 'org-ecom-dev' },
  { id: 'proxy-es-ecommerce', name: 'ES E-commerce', organizationId: 'org-ecom-dev' },
  { id: 'proxy-de-healthcare', name: 'DE Healthcare', organizationId: 'org-health-dev' },
  { id: 'proxy-us-identity', name: 'US Identity', organizationId: 'org-id-dev' },
  { id: 'proxy-jp-iot', name: 'JP IoT', organizationId: 'org-iot-dev' },
  { id: 'proxy-br-streaming', name: 'BR Streaming', organizationId: 'org-stream-dev' },
  { id: 'proxy-kr-gaming', name: 'KR Gaming', organizationId: 'org-game-dev' },
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
    await prisma.apiProxy.upsert({
      where: { id: proxy.id },
      update: {
        name: proxy.name,
        active: true,
        organizationId: proxy.organizationId,
      },
      create: {
        ...proxy,
        active: true,
      },
    });
  }

  await prisma.apiProxy.upsert({
    where: { id: 'proxy-platform-oauth' },
    update: {
      name: 'Platform OAuth',
      active: true,
      systemManaged: true,
      organizationId: 'org-platform',
    },
    create: {
      id: 'proxy-platform-oauth',
      name: 'Platform OAuth',
      active: true,
      systemManaged: true,
      organizationId: 'org-platform',
    },
  });

  console.log(`${ORGANIZATIONS.length} organizations`);
  console.log(`${ENVIRONMENTS.length} closed-choice environments`);
  console.log(`${PROXIES.length + 1} logical proxies`);
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error('Base seed failed:', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
