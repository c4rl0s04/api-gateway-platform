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
  createProxyDeployment,
  DeploymentProgressionError,
} from './deployments.js';
export type { CreateProxyDeploymentInput } from './deployments.js';
export {
  createAppCredential,
  hashConsumerSecret,
  normalizeCertificateFingerprint,
  replaceCredentialProductGrants,
  registerAppCertificate,
  registerAppPublicKey,
  revokeAppCertificate,
  revokeAppPublicKey,
  revokeCredentialProductGrant,
  rotateConsumerSecret,
  setCredentialProductGrant,
  verifyConsumerSecret,
} from './credentials.js';
export type {
  CreateAppCredentialInput,
  RegisterAppCertificateInput,
  RegisterAppPublicKeyInput,
  ReplaceCredentialProductGrantsInput,
  SetCredentialProductGrantInput,
} from './credentials.js';
