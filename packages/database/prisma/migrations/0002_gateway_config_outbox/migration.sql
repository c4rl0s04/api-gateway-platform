CREATE TABLE "GatewayConfigChange" (
    "version" SERIAL NOT NULL,
    "changeType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "environmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "GatewayConfigChange_pkey" PRIMARY KEY ("version")
);

CREATE INDEX "GatewayConfigChange_publishedAt_version_idx"
ON "GatewayConfigChange"("publishedAt", "version");
