import { buildServer, loadEnv } from './server.js';
import { createCertificateAuthorityService } from './services/certificate-authorities.js';
import { EncryptedFileKeyStore, loadOrCreateMasterKey } from '@api-gateway/pki';
import { CertificateService } from './services/certificates.js';
import { ApplicationService } from './services/applications.js';
import { GatewayCatalogService } from './services/gateway-catalog.js';
import { ProxyRevisionService } from './services/proxy-revisions.js';

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
    applications: new ApplicationService(),
    certificateAuthorities,
    certificates,
    gatewayCatalog: new GatewayCatalogService(),
    proxyRevisions: new ProxyRevisionService(),
  });
  try {
    await server.listen({ port: config.PORT, host: config.HOST });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
})();
