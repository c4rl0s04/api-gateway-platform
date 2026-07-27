import { buildServer, loadEnv } from './server.js';

void (async () => {
  const config = loadEnv();
  const server = buildServer({ config });
  try {
    await server.listen({ port: config.PORT, host: config.HOST });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
})();
