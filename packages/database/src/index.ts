// Singleton client — import this in gateway-core and management-api
export { prisma } from './client.js';

// Prisma types — useful for annotating query results in management-api
export { PrismaClient, Prisma } from './generated/index.js';
