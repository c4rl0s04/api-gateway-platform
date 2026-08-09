import {
  environmentConfigSchema,
  isPolicyType,
  parsePolicyConfig,
  type ProxyConfig,
  type EndpointConfig,
  type PolicyConfig,
} from '@api-gateway/shared';
import { prisma } from '@api-gateway/database';

/**
 * Loads all active proxies from PostgreSQL and converts them
 * to the in-memory format used by the gateway registry.
 *
 * This is the only point of contact between the gateway and the database.
 * It is executed once on startup. In a future iteration, periodic refresh
 * via Redis pub/sub will be added when the admin panel edits a proxy.
 */
export async function loadProxiesFromDatabase(
  environmentIds?: readonly string[],
): Promise<ProxyConfig[]> {
  const deployments = await prisma.proxyDeployment.findMany({
    where: {
      status: 'active',
      proxy: { active: true },
      OR: [
        {
          labWorkspaceId: null,
          proxy: { organization: { kind: 'standard' } },
        },
        {
          labWorkspace: {
            status: 'active',
            expiresAt: { gt: new Date() },
          },
          proxy: { organization: { kind: 'lab' } },
        },
      ],
      ...(environmentIds && environmentIds.length > 0
        ? { environmentId: { in: [...environmentIds] } }
        : {}),
    },
    include: {
      environment: true,
      labWorkspace: true,
      proxy: true,
      revision: {
        include: {
          operations: {
            include: {
              policies: { orderBy: { order: 'asc' } },
            },
          },
        },
      },
    },
  });

  const configs = deployments.map((deployment): ProxyConfig => {
    const proxy = deployment.proxy;
    const revision = deployment.revision;
    if (!revision) {
      throw new Error(`Active deployment "${deployment.id}" has no proxy revision`);
    }

    const runtimePublicOrigin = deployment.labWorkspace
      ? labPublicOrigin(
          deployment.labWorkspace.hostname,
          deployment.environment.publicOrigin,
        )
      : deployment.environment.publicOrigin;
    return {
      id: proxy.id,
      name: proxy.name,
      basePath: revision.basePath,
      deploymentId: deployment.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      environment: environmentConfigSchema.parse({
        id: deployment.environment.id,
        stage: deployment.environment.stage,
        region: deployment.environment.region,
        publicOrigin: deployment.environment.publicOrigin,
      }),
      workspaceId: deployment.labWorkspaceId,
      runtimeAuthority: new URL(runtimePublicOrigin).host.toLowerCase(),
      runtimePublicOrigin,
      systemManaged: proxy.systemManaged,
      upstreamBaseUrl: deployment.upstreamBaseUrl,
      organizationId: proxy.organizationId,
      active: deployment.status === 'active' && proxy.active,
      endpoints: revision.operations.map((ep): EndpointConfig => {
        const policies = ep.policies.map((pol): PolicyConfig => {
          if (!isPolicyType(pol.type)) {
            throw new Error(
              `Unsupported policy type "${pol.type}" on endpoint "${ep.id}"`,
            );
          }

          return {
            type: pol.type,
            order: pol.order,
            enabled: pol.enabled,
            config: parsePolicyConfig(pol.type, pol.config),
          } as PolicyConfig;
        });
        const mode = ep.mode as 'forward' | 'local';
        const types = policies.filter(policy => policy.enabled).map(policy => policy.type);
        const authenticationTypes = types.filter(type =>
          ['api-key-auth', 'oauth-access-token', 'mtls-auth'].includes(type));
        if (authenticationTypes.length > 1) {
          throw new Error(`Endpoint "${ep.id}" configures more than one authentication policy`);
        }
        if (mode === 'local' && !types.some(type =>
          type === 'oauth-token' || type === 'jwks-endpoint')) {
          throw new Error(`Local endpoint "${ep.id}" has no terminal response policy`);
        }
        if (mode === 'forward' && !ep.targetPath) {
          throw new Error(`Forward endpoint "${ep.id}" requires targetPath`);
        }
        if (mode === 'forward' && !deployment.upstreamBaseUrl) {
          throw new Error(`Deployment "${deployment.id}" requires upstreamBaseUrl`);
        }
        if (types.includes('oauth-token') && mode !== 'local') {
          throw new Error(`oauth-token policy on "${ep.id}" requires local mode`);
        }
        if (types.includes('jwks-endpoint') && mode !== 'local') {
          throw new Error(`jwks-endpoint policy on "${ep.id}" requires local mode`);
        }
        return {
          id: ep.id,
          operationId: ep.operationId,
          method: ep.method,
          mode,
          path: ep.path,
          targetPath: ep.targetPath,
          policies,
        };
      }),
    };
  });

  const activeLabContexts = new Map<string, {
    workspaceId: string;
    hostname: string;
    environmentId: string;
  }>();
  for (const deployment of deployments) {
    if (!deployment.labWorkspace) continue;
    activeLabContexts.set(
      `${deployment.labWorkspace.id}:${deployment.environmentId}`,
      {
        workspaceId: deployment.labWorkspace.id,
        hostname: deployment.labWorkspace.hostname,
        environmentId: deployment.environmentId,
      },
    );
  }
  for (const context of activeLabContexts.values()) {
    const oauth = configs.find(config =>
      config.id === 'proxy-platform-oauth'
      && config.environment.id === context.environmentId
      && !config.workspaceId);
    if (!oauth) continue;
    const runtimePublicOrigin = labPublicOrigin(
      context.hostname,
      oauth.environment.publicOrigin,
    );
    configs.push({
      ...oauth,
      deploymentId: `${oauth.deploymentId}:lab:${context.workspaceId}`,
      workspaceId: context.workspaceId,
      runtimeAuthority: new URL(runtimePublicOrigin).host.toLowerCase(),
      runtimePublicOrigin,
    });
  }
  return configs;
}

function labPublicOrigin(hostname: string, environmentOrigin: string): string {
  const environment = new URL(environmentOrigin);
  return `https://${hostname}${environment.port ? `:${environment.port}` : ''}`;
}
