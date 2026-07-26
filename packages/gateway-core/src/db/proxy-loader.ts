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
  environmentId?: string,
): Promise<ProxyConfig[]> {
  const deployments = await prisma.proxyDeployment.findMany({
    where: {
      active: true,
      proxy: { active: true },
      ...(environmentId ? { environmentId } : {}),
    },
    include: {
      environment: true,
      proxy: {
        include: {
          endpoints: {
            include: {
              policies: { orderBy: { order: 'asc' } },
            },
          },
        },
      },
    },
  });

  const basePaths = new Set<string>();

  return deployments.map((deployment): ProxyConfig => {
    const proxy = deployment.proxy;
    if (basePaths.has(proxy.basePath)) {
      throw new Error(
        `Multiple active deployments use basePath "${proxy.basePath}". `
        + 'Set GATEWAY_ENVIRONMENT_ID so this gateway loads one environment.',
      );
    }
    basePaths.add(proxy.basePath);

    return {
      id: proxy.id,
      name: proxy.name,
      basePath: proxy.basePath,
      deploymentId: deployment.id,
      environment: environmentConfigSchema.parse({
        id: deployment.environment.id,
        stage: deployment.environment.stage,
        region: deployment.environment.region,
      }),
      systemManaged: proxy.systemManaged,
      upstreamBaseUrl: deployment.upstreamBaseUrl,
      organizationId: proxy.organizationId,
      active: deployment.active && proxy.active,
      endpoints: proxy.endpoints.map((ep): EndpointConfig => {
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
          mode,
          path: ep.path,
          targetPath: ep.targetPath,
          policies,
        };
      }),
    };
  });
}
