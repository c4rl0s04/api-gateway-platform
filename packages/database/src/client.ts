import { PrismaClient } from './generated/index.js';

/**
 * Singleton de PrismaClient compartido por toda la aplicación.
 *
 * El bloqueo en globalThis evita que el hot-reload de desarrollo cree múltiples
 * pools de conexión (problema conocido de Node.js con módulos con estado).
 * En producción, siempre se crea una instancia nueva limpia.
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
