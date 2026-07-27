import { buildServer, loadEnv } from './server.js';
import { createCertificateAuthorityService } from './services/certificate-authorities.js';
import { EncryptedFileKeyStore, loadOrCreateMasterKey } from '@api-gateway/pki';
import { CertificateService } from './services/certificates.js';

void (async () => {
  const config = loadEnv();
  const certificateAuthorities = await createCertificateAuthorityService(config);
  const masterKey = await loadOrCreateMasterKey(config.PKI_MASTER_KEY_FILE);
  const certificates = new CertificateService(
    new EncryptedFileKeyStore(config.PKI_KEYSTORE_DIR, masterKey),
    certificateAuthorities,
  );
  const server = buildServer({
    config,
    certificateAuthorities,
    certificates,
  });
  try {
    await server.listen({ port: config.PORT, host: config.HOST });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
})();
