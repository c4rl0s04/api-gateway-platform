import { z } from 'zod';
import { buildLabEgressServer } from './server.js';

const env = z.object({
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3010),
  DATABASE_URL: z.string().url(),
}).parse(process.env);

const server = buildLabEgressServer(true);
server.listen({ host: env.HOST, port: env.PORT }).catch(error => {
  server.log.error(error);
  process.exit(1);
});
