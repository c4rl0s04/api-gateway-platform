import { z } from 'zod';

export const GATEWAY_CONFIG_CHANGE_CHANNEL = 'gateway:config:changes:v1';
export const GATEWAY_RUNTIME_STATUS_PREFIX = 'gateway:runtime:v1:';

export const gatewayConfigChangeMessageSchema = z.object({
  version: z.number().int().positive(),
}).strict();

export const gatewayRuntimeStatusSchema = z.object({
  instanceId: z.string().trim().min(1),
  state: z.enum(['loading', 'applied', 'error']),
  appliedVersion: z.number().int().nonnegative(),
  lastAppliedAt: z.string().datetime({ offset: true }).nullable(),
  lastError: z.string().nullable(),
}).strict();

export type GatewayConfigChangeMessage = z.infer<
  typeof gatewayConfigChangeMessageSchema
>;
export type GatewayRuntimeStatus = z.infer<typeof gatewayRuntimeStatusSchema>;
