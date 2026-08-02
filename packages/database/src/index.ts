// Singleton client — import this in gateway-core and management-api
export { prisma } from './client.js';

// Prisma types — useful for annotating query results in management-api
export {
  AdminRole,
  AuthorizationStatus,
  CertificateAuthorityKind,
  CertificateAuthorityStatus,
  CertificateSource,
  PrismaClient,
  Prisma,
} from './generated/index.js';

export {
  compileProxyBundle,
  ProxyBundleError,
} from './proxy-bundle.js';
export type {
  CompileProxyBundleInput,
  CompiledProxyBundle,
  CompiledProxyOperation,
  ProxyBundleErrorCode,
} from './proxy-bundle.js';
export {
  createApiProxy,
  getProxyRevision,
  getProxyRevisionSource,
  importProxyRevision,
  listProxyRevisions,
  updateApiProxy,
  ProxyRevisionError,
} from './proxy-revisions.js';
export {
  deployProxyRevision,
  listProxyDeployments,
  ProxyDeploymentError,
  retireProxyDeployment,
} from './proxy-deployments.js';
export type {
  DeployProxyRevisionInput,
  DeploymentMutationActor,
  ProxyDeploymentErrorCode,
  RetireProxyDeploymentInput,
} from './proxy-deployments.js';
export type {
  CreateApiProxyInput,
  ImportProxyRevisionInput,
  ProxyMutationActor,
  ProxyRevisionErrorCode,
  UpdateApiProxyInput,
} from './proxy-revisions.js';
export {
  createAppCredential,
  hashConsumerSecret,
  normalizeCertificateFingerprint,
  registerDeveloperApplication,
  replaceCredentialProductGrants,
  registerAppCertificate,
  registerAppPublicKey,
  revokeAppCertificate,
  revokeAppPublicKey,
  revokeCredentialProductGrant,
  rotateConsumerSecret,
  setCredentialProductGrant,
  verifyConsumerSecret,
  RegisterDeveloperApplicationError,
} from './credentials.js';
export type {
  CreateAppCredentialInput,
  RegisterAppCertificateInput,
  RegisterAppPublicKeyInput,
  RegisterDeveloperApplicationErrorCode,
  RegisterDeveloperApplicationInput,
  ReplaceCredentialProductGrantsInput,
  SetCredentialProductGrantInput,
} from './credentials.js';
