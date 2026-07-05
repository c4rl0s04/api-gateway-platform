/**
 * Re-exporta el cliente Prisma desde el paquete centralizado @api-gateway/database.
 *
 * El schema, las migraciones y el seed viven en packages/database.
 * Este archivo permite que las rutas de management-api hagan:
 *   import { prisma } from '../db/client'
 * sin cambiar sus imports cuando centralizamos Prisma.
 */
export { prisma } from '@api-gateway/database';
