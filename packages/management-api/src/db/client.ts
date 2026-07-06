/**
 * Re-exports the Prisma client from the centralized @api-gateway/database package.
 *
 * The schema, migrations and seed live in packages/database.
 * This file allows management-api routes to do:
 *   import { prisma } from '../db/client'
 * without changing their imports when we centralize Prisma.
 */
export { prisma } from '@api-gateway/database';
