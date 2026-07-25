// Cliente singleton — importar esto en gateway-core y management-api
export { prisma } from './client.js';

// Tipos de Prisma — útiles para anotar resultados de queries en management-api
export { PrismaClient, Prisma } from './generated/index.js';
