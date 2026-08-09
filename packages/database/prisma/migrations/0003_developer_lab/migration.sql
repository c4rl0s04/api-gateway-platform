CREATE TYPE "OrganizationKind" AS ENUM ('standard', 'lab');
CREATE TYPE "CredentialPurpose" AS ENUM ('standard', 'playground', 'lab');
CREATE TYPE "LabWorkspaceStatus" AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE "LabUpstreamKind" AS ENUM ('mock', 'publicHttps');

ALTER TABLE "Organization"
ADD COLUMN "kind" "OrganizationKind" NOT NULL DEFAULT 'standard';

ALTER TABLE "AppCredential"
ADD COLUMN "purpose" "CredentialPurpose" NOT NULL DEFAULT 'standard';

CREATE TABLE "LabWorkspace" (
    "id" TEXT NOT NULL,
    "ownerIssuer" TEXT NOT NULL,
    "ownerSubject" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" "LabWorkspaceStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabUpstream" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LabUpstreamKind" NOT NULL,
    "targetUrl" TEXT,
    "mockConfig" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabUpstream_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProxyDeployment" ADD COLUMN "labWorkspaceId" TEXT;

CREATE UNIQUE INDEX "LabWorkspace_organizationId_key" ON "LabWorkspace"("organizationId");
CREATE UNIQUE INDEX "LabWorkspace_hostname_key" ON "LabWorkspace"("hostname");
CREATE UNIQUE INDEX "LabWorkspace_active_owner_key"
ON "LabWorkspace"("ownerIssuer", "ownerSubject")
WHERE "status" = 'active';
CREATE INDEX "LabWorkspace_ownerIssuer_ownerSubject_status_idx"
ON "LabWorkspace"("ownerIssuer", "ownerSubject", "status");
CREATE INDEX "LabWorkspace_expiresAt_status_idx"
ON "LabWorkspace"("expiresAt", "status");
CREATE UNIQUE INDEX "LabUpstream_workspaceId_name_key" ON "LabUpstream"("workspaceId", "name");
CREATE INDEX "LabUpstream_workspaceId_active_idx" ON "LabUpstream"("workspaceId", "active");
CREATE INDEX "ProxyDeployment_labWorkspaceId_status_idx" ON "ProxyDeployment"("labWorkspaceId", "status");

ALTER TABLE "LabWorkspace"
ADD CONSTRAINT "LabWorkspace_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LabUpstream"
ADD CONSTRAINT "LabUpstream_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "LabWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProxyDeployment"
ADD CONSTRAINT "ProxyDeployment_labWorkspaceId_fkey"
FOREIGN KEY ("labWorkspaceId") REFERENCES "LabWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
