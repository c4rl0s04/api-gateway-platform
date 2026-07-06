import { PrismaClient } from './generated/index.js';

/**
 * PrismaClient singleton shared throughout the application.
 *
 * The lock on globalThis prevents development hot-reload from creating multiple
 * connection pools (known Node.js issue with stateful modules).
 * In production, a clean new instance is always created.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
