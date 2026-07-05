import type { ProxyConfig, EndpointConfig, PolicyConfig, PolicyType } from '@api-gateway/shared';
import { prisma } from '@api-gateway/database';

/**
 * Carga todos los proxies activos desde PostgreSQL y los convierte
 * al formato en memoria que usa el registry del gateway.
 *
 * Es el único punto de contacto entre el gateway y la base de datos.
 * Se ejecuta una vez al arrancar. En una iteración futura se añadirá
 * refresco periódico vía Redis pub/sub cuando el panel admin edite un proxy.
 */
export async function loadProxiesFromDatabase(): Promise<ProxyConfig[]> {
  const rows = await prisma.apiProxy.findMany({
    where: { active: true },
    include: {
      // Necesitamos environment para obtener organizationId
      environment: true,
      endpoints: {
        include: {
          // Políticas ordenadas: el orden de ejecución del pipeline viene de la DB
          policies: { orderBy: { order: 'asc' } },
        },
      },
    },
  });

  return rows.map((row): ProxyConfig => ({
    id:             row.id,
    name:           row.name,
    basePath:       row.basePath,
    organizationId: row.environment.organizationId,
    environmentId:  row.environmentId,
    active:         row.active,
    endpoints:      row.endpoints.map((ep): EndpointConfig => ({
      id:        ep.id,
      path:      ep.path,
      targetUrl: ep.targetUrl,
      policies:  ep.policies.map((pol): PolicyConfig => ({
        type:    pol.type as PolicyType,
        order:   pol.order,
        enabled: pol.enabled,
        config:  pol.config as Record<string, unknown>,
      })),
    })),
  }));
}
