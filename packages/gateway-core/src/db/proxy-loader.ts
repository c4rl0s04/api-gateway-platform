import type { ProxyConfig, EndpointConfig, PolicyConfig, PolicyType } from '@api-gateway/shared';
import { prisma } from '@api-gateway/database';

/**
 * Loads all active proxies from PostgreSQL and converts them
 * to the in-memory format used by the gateway registry.
 *
 * This is the only point of contact between the gateway and the database.
 * It is executed once on startup. In a future iteration, periodic refresh
 * via Redis pub/sub will be added when the admin panel edits a proxy.
 */
export async function loadProxiesFromDatabase(): Promise<ProxyConfig[]> {
  const rows = await prisma.apiProxy.findMany({
    where: { active: true },
    include: {
      // We need environment to get organizationId
      environment: true,
      endpoints: {
        include: {
          // Ordered policies: the execution order of the pipeline comes from the DB
          policies: { orderBy: { order: 'asc' } },
        },
      },
    },
  });

  return rows.map((row: any): ProxyConfig => ({
    id:             row.id,
    name:           row.name,
    basePath:       row.basePath,
    organizationId: row.environment.organizationId,
    environmentId:  row.environmentId,
    active:         row.active,
    endpoints:      row.endpoints.map((ep: any): EndpointConfig => ({
      id:        ep.id,
      path:      ep.path,
      targetUrl: ep.targetUrl,
      policies:  ep.policies.map((pol: any): PolicyConfig => ({
        type:    pol.type as PolicyType,
        order:   pol.order,
        enabled: pol.enabled,
        config:  pol.config as Record<string, unknown>,
      })),
    })),
  }));
}
