-- CreateEnum
CREATE TYPE "DeploymentStage" AS ENUM ('qual', 'pprod', 'prod');

-- CreateEnum
CREATE TYPE "DeploymentRegion" AS ENUM ('ce', 'es', 'de', 'be', 'fr', 'us', 'uk', 'jp', 'br', 'kr');

-- CreateEnum
CREATE TYPE "EndpointMode" AS ENUM ('forward', 'local');

-- CreateEnum
CREATE TYPE "AuthorizationStatus" AS ENUM ('pending', 'approved', 'revoked');

-- CreateEnum
CREATE TYPE "PublicKeyAlgorithm" AS ENUM ('RS256');

-- CreateEnum
CREATE TYPE "CertificateAuthorityKind" AS ENUM ('managed', 'external');

-- CreateEnum
CREATE TYPE "CertificateAuthorityStatus" AS ENUM ('draft', 'active', 'retiring', 'revoked');

-- CreateEnum
CREATE TYPE "CertificateSource" AS ENUM ('managed', 'external', 'legacy');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('platformAdmin', 'organizationAdmin', 'viewer');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "stage" "DeploymentStage" NOT NULL,
    "region" "DeploymentRegion" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiProxy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "systemManaged" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiProxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyDeployment" (
    "id" TEXT NOT NULL,
    "proxyId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "upstreamBaseUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Endpoint" (
    "id" TEXT NOT NULL,
    "mode" "EndpointMode" NOT NULL DEFAULT 'forward',
    "path" TEXT NOT NULL,
    "targetPath" TEXT,
    "proxyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndpointPolicy" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "endpointId" TEXT NOT NULL,

    CONSTRAINT "EndpointPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'approved',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppCredential" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "consumerSecretHash" TEXT NOT NULL,
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'approved',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialProductGrant" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'pending',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialProductGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPublicKey" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "algorithm" "PublicKeyAlgorithm" NOT NULL DEFAULT 'RS256',
    "jwk" JSONB NOT NULL,
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'approved',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppPublicKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppCertificate" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "authorityId" TEXT,
    "fingerprintSha256" TEXT NOT NULL,
    "certificatePem" TEXT,
    "chainPem" TEXT,
    "source" "CertificateSource" NOT NULL DEFAULT 'legacy',
    "serialNumber" TEXT,
    "subject" TEXT,
    "issuer" TEXT,
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'approved',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateAuthority" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CertificateAuthorityKind" NOT NULL,
    "status" "CertificateAuthorityStatus" NOT NULL DEFAULT 'draft',
    "isDefaultIssuer" BOOLEAN NOT NULL DEFAULT false,
    "certificatePem" TEXT NOT NULL,
    "chainPem" TEXT,
    "fingerprintSha256" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "keyRef" TEXT,
    "crlPem" TEXT,
    "crlThisUpdate" TIMESTAMP(3),
    "crlNextUpdate" TIMESTAMP(3),
    "crlDistributionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateIssuance" (
    "id" TEXT NOT NULL,
    "authorityId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "csrSha256" TEXT NOT NULL,
    "requestedDays" INTEGER NOT NULL,
    "certificateId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CertificateIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMembership" (
    "id" TEXT NOT NULL,
    "oidcIssuer" TEXT NOT NULL,
    "oidcSubject" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "organizationId" TEXT,
    "displayName" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorIssuer" TEXT NOT NULL,
    "actorSubject" TEXT NOT NULL,
    "actorRole" "AdminRole" NOT NULL,
    "organizationId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ApiProductToApiProxy" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ApiProductToEnvironment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Environment_stage_region_key" ON "Environment"("stage", "region");

-- CreateIndex
CREATE UNIQUE INDEX "ApiProxy_basePath_key" ON "ApiProxy"("basePath");

-- CreateIndex
CREATE UNIQUE INDEX "ProxyDeployment_proxyId_environmentId_key" ON "ProxyDeployment"("proxyId", "environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AppCredential_consumerKey_key" ON "AppCredential"("consumerKey");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialProductGrant_credentialId_productId_key" ON "CredentialProductGrant"("credentialId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "AppPublicKey_credentialId_kid_key" ON "AppPublicKey"("credentialId", "kid");

-- CreateIndex
CREATE UNIQUE INDEX "AppCertificate_fingerprintSha256_key" ON "AppCertificate"("fingerprintSha256");

-- CreateIndex
CREATE INDEX "AppCertificate_authorityId_idx" ON "AppCertificate"("authorityId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateAuthority_fingerprintSha256_key" ON "CertificateAuthority"("fingerprintSha256");

-- CreateIndex
CREATE INDEX "CertificateAuthority_organizationId_status_idx" ON "CertificateAuthority"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateIssuance_certificateId_key" ON "CertificateIssuance"("certificateId");

-- CreateIndex
CREATE INDEX "CertificateIssuance_authorityId_createdAt_idx" ON "CertificateIssuance"("authorityId", "createdAt");

-- CreateIndex
CREATE INDEX "CertificateIssuance_credentialId_createdAt_idx" ON "CertificateIssuance"("credentialId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminMembership_organizationId_role_idx" ON "AdminMembership"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AdminMembership_oidcIssuer_oidcSubject_scopeKey_key" ON "AdminMembership"("oidcIssuer", "oidcSubject", "scopeKey");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_createdAt_idx" ON "AuditEvent"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_ApiProductToApiProxy_AB_unique" ON "_ApiProductToApiProxy"("A", "B");

-- CreateIndex
CREATE INDEX "_ApiProductToApiProxy_B_index" ON "_ApiProductToApiProxy"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ApiProductToEnvironment_AB_unique" ON "_ApiProductToEnvironment"("A", "B");

-- CreateIndex
CREATE INDEX "_ApiProductToEnvironment_B_index" ON "_ApiProductToEnvironment"("B");

-- AddForeignKey
ALTER TABLE "ApiProxy" ADD CONSTRAINT "ApiProxy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyDeployment" ADD CONSTRAINT "ProxyDeployment_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "ApiProxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyDeployment" ADD CONSTRAINT "ProxyDeployment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "ApiProxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndpointPolicy" ADD CONSTRAINT "EndpointPolicy_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiProduct" ADD CONSTRAINT "ApiProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperApp" ADD CONSTRAINT "DeveloperApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCredential" ADD CONSTRAINT "AppCredential_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialProductGrant" ADD CONSTRAINT "CredentialProductGrant_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialProductGrant" ADD CONSTRAINT "CredentialProductGrant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPublicKey" ADD CONSTRAINT "AppPublicKey_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCertificate" ADD CONSTRAINT "AppCertificate_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCertificate" ADD CONSTRAINT "AppCertificate_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "CertificateAuthority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateAuthority" ADD CONSTRAINT "CertificateAuthority_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateIssuance" ADD CONSTRAINT "CertificateIssuance_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "CertificateAuthority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateIssuance" ADD CONSTRAINT "CertificateIssuance_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AppCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateIssuance" ADD CONSTRAINT "CertificateIssuance_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "AppCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMembership" ADD CONSTRAINT "AdminMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiProductToApiProxy" ADD CONSTRAINT "_ApiProductToApiProxy_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiProductToApiProxy" ADD CONSTRAINT "_ApiProductToApiProxy_B_fkey" FOREIGN KEY ("B") REFERENCES "ApiProxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiProductToEnvironment" ADD CONSTRAINT "_ApiProductToEnvironment_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiProductToEnvironment" ADD CONSTRAINT "_ApiProductToEnvironment_B_fkey" FOREIGN KEY ("B") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
