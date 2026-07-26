import { buildServer } from './server';
import { loadEnv } from './config/env';

(async () => {
  try {
    const config = loadEnv();
    const server = await buildServer({ config });
    await server.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    console.error('Failed to start gateway server', err);
    process.exit(1);
  }
})();
