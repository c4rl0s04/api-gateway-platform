import type { PolicyConfig } from '@api-gateway/shared';
import type { PolicyContext, PolicyResult } from './types';
import { createPolicy } from './registry';
import { CONTINUE, halt } from './types';

/**
 * Ejecuta el pipeline de políticas de un endpoint en orden.
 *
 * Comportamiento:
 * - Solo se ejecutan las políticas con `enabled: true`.
 * - Se ejecutan en orden ascendente de `order`.
 * - Si cualquier política devuelve `halt`, la cadena se corta inmediatamente.
 *   Las políticas siguientes NO se ejecutan y el gateway NO hace forward al backend.
 * - Si todas las políticas devuelven `continue`, se devuelve CONTINUE
 *   y el gateway procede con el forwarding.
 *
 * Este patrón es equivalente al "chain of responsibility" y es
 * la misma mecánica que usa Apigee internamente con sus Flow Steps.
 */
export async function executePipeline(
  policies: PolicyConfig[],
  ctx: PolicyContext,
): Promise<PolicyResult> {
  const activePolicies = [...policies]
    .filter(p => p.enabled)
    .sort((a, b) => a.order - b.order);

  if (activePolicies.length === 0) {
    return CONTINUE;
  }

  for (const policyConfig of activePolicies) {
    let result: PolicyResult;
    try {
      const policy = createPolicy(policyConfig.type, policyConfig.config);
      result = await policy(ctx);
    } catch (err) {
      ctx.req.log.error(
        {
          err,
          policyType: policyConfig.type,
          failureMode: policyConfig.config.failureMode,
          proxyId: ctx.proxy.id,
          endpointId: ctx.endpoint.id,
        },
        'Policy execution failed unexpectedly',
      );
      ctx.state[`${policyConfig.type}.degraded`] = true;

      if (policyConfig.config.failureMode === 'open') {
        continue;
      }

      return halt(503, {
        error: 'Service Unavailable',
        message: `Policy "${policyConfig.type}" is temporarily unavailable`,
        requestId: ctx.req.id,
      });
    }

    if (result.action !== 'continue') {
      ctx.req.log.info(
        {
          policyType: policyConfig.type,
          statusCode: result.statusCode,
          proxyId:     ctx.proxy.id,
          endpointId:  ctx.endpoint.id,
        },
        'Pipeline halted by policy',
      );
      return result;
    }
  }

  return CONTINUE;
}
