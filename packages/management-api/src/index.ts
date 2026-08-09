import { buildServer, loadEnv } from './server.js';
import { createCertificateAuthorityService } from './services/certificate-authorities.js';
import { EncryptedFileKeyStore, loadOrCreateMasterKey } from '@api-gateway/pki';
import { CertificateService } from './services/certificates.js';
import { ApplicationService } from './services/applications.js';
import { GatewayCatalogService } from './services/gateway-catalog.js';
import { ProxyRevisionService } from './services/proxy-revisions.js';
import { OrganizationService } from './services/organizations.js';
import { ProductService } from './services/products.js';
import { AuditService } from './services/audit.js';
import { createGatewayConfigPublisher } from './runtime-sync/publisher.js';
import { createRuntimeSyncService } from './services/runtime-sync.js';
import { expireDueLabWorkspaces } from '@api-gateway/database';
import { LabWorkspaceService } from './services/lab-workspaces.js';
import { LabUpstreamService } from './services/lab-upstreams.js';
import { LabProxyService } from './services/lab-proxies.js';
import { LabProductService } from './services/lab-products.js';
import { LabApplicationService } from './services/lab-applications.js';
import { LabAuditService } from './services/lab-audit.js';

void (async () => {
  const config = loadEnv();
  const certificateAuthorities = await createCertificateAuthorityService(config);
  const masterKey = await loadOrCreateMasterKey(config.PKI_MASTER_KEY_FILE);
  const certificates = new CertificateService(
    new EncryptedFileKeyStore(config.PKI_KEYSTORE_DIR, masterKey),
    certificateAuthorities,
  );
  const publisher = createGatewayConfigPublisher(config.REDIS_URL, console);
  const runtimeSync = createRuntimeSyncService(config.REDIS_URL);
  publisher.start();
  const gatewayCatalog = new GatewayCatalogService();
  const proxyRevisions = new ProxyRevisionService(publisher);
  const products = new ProductService();
  const applications = new ApplicationService();
  const audit = new AuditService();
  const server = buildServer({
    config,
    organizations: new OrganizationService(),
    products,
    audit,
    applications,
    certificateAuthorities,
    certificates,
    gatewayCatalog,
    proxyRevisions,
    runtimeSync,
    labWorkspaces: new LabWorkspaceService(),
    labUpstreams: new LabUpstreamService(),
    labProxies: new LabProxyService(gatewayCatalog, proxyRevisions),
    labProducts: new LabProductService(products),
    labApplications: new LabApplicationService(applications),
    labAudit: new LabAuditService(audit),
  });
  const labExpirationWorker = setInterval(() => {
    void expireDueLabWorkspaces().catch(error => {
      server.log.error({ err: error }, 'Lab workspace expiration sweep failed');
    });
  }, 60_000);
  labExpirationWorker.unref();
  server.addHook('onClose', async () => {
    clearInterval(labExpirationWorker);
    await Promise.all([publisher.close(), runtimeSync.close()]);
  });
  try {
    await server.listen({ port: config.PORT, host: config.HOST });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
})();
