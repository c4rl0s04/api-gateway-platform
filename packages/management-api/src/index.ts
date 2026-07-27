import { buildServer, loadEnv } from './server.js';
import { createCertificateAuthorityService } from './services/certificate-authorities.js';

void (async () => {
  const config = loadEnv();
  const certificateAuthorities = await createCertificateAuthorityService(config);
  const server = buildServer({ config, certificateAuthorities });
  try {
    await server.listen({ port: config.PORT, host: config.HOST });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
})();
