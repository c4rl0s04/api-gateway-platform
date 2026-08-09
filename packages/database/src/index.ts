// Singleton client — import this in gateway-core and management-api
export { prisma } from './client.js';

// Prisma types — useful for annotating query results in management-api
export {
  AdminRole,
  AuthorizationStatus,
  CertificateAuthorityKind,
  CertificateAuthorityStatus,
  CertificateSource,
  CredentialPurpose,
  LabUpstreamKind,
  LabWorkspaceStatus,
  OrganizationKind,
  PrismaClient,
  Prisma,
} from './generated/index.js';

export {
  compileProxyBundle,
  inspectOpenApi,
  ProxyBundleError,
} from './proxy-bundle.js';
export type {
  CompileProxyBundleInput,
  CompiledProxyBundle,
  CompiledProxyOperation,
  HttpMethod,
  InspectedOpenApi,
  OpenApiOperationSummary,
  ProxyBundleErrorCode,
} from './proxy-bundle.js';
export { requestBodiesForOperation } from './openapi-request-bodies.js';
export type {
  OpenApiRequestBody,
  OpenApiRequestExample,
  RequestExampleSource,
} from './openapi-request-bodies.js';
export {
  createApiProxy,
  createConfiguredApiProxy,
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
  CreateConfiguredApiProxyInput,
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
export {
  ApplicationManagementError,
  cloneManagedCredential,
  createManagedCredential,
  rotateManagedConsumerSecret,
  replaceManagedCredentialGrants,
  registerManagedPublicKey,
  revokeManagedPublicKey,
  updateDeveloperApplication,
  updateManagedCredential,
} from './application-management.js';
export {
  createPersonalLabWorkspace,
  expireDueLabWorkspaces,
  getPersonalLabWorkspace,
  resetPersonalLabWorkspace,
  revokePersonalLabWorkspace,
  LabWorkspaceError,
} from './lab-workspaces.js';
export type {
  LabPrincipal,
  LabWorkspaceErrorCode,
} from './lab-workspaces.js';
export {
  createLabUpstream,
  listLabUpstreams,
  normalizeLabMockRoutes,
  normalizeLabPublicHttpsUrl,
  resolveLabUpstreamInternalUrl,
  updateLabUpstream,
  LabUpstreamError,
} from './lab-upstreams.js';
export type {
  CreateLabUpstreamInput,
  LabMockRoute,
  LabUpstreamActor,
  LabUpstreamErrorCode,
  UpdateLabUpstreamInput,
} from './lab-upstreams.js';
export {
  countPendingGatewayConfigChanges,
  getLatestGatewayConfigVersion,
  listPendingGatewayConfigChanges,
  markGatewayConfigChangePublished,
  markGatewayConfigChangePublishFailed,
  recordGatewayConfigChange,
} from './gateway-config-changes.js';
export type {
  RecordGatewayConfigChangeInput,
} from './gateway-config-changes.js';
export type {
  ApplicationManagementErrorCode,
  ApplicationMutationActor,
  CloneManagedCredentialInput,
  CreateManagedCredentialInput,
  RotateManagedConsumerSecretInput,
  ReplaceManagedCredentialGrantsInput,
  RegisterManagedPublicKeyInput,
  RevokeManagedPublicKeyInput,
  UpdateDeveloperApplicationInput,
  UpdateManagedCredentialInput,
} from './application-management.js';
export type {
  CreateAppCredentialInput,
  RegisterAppCertificateInput,
  RegisterAppPublicKeyInput,
  RegisterDeveloperApplicationErrorCode,
  RegisterDeveloperApplicationInput,
  ReplaceCredentialProductGrantsInput,
  SetCredentialProductGrantInput,
} from './credentials.js';
