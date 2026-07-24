import { buildServer } from './server';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

(async () => {
  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
  } catch (err) {
    server.log.fatal({ err }, 'Failed to start gateway server');
    process.exit(1);
  }
})();
