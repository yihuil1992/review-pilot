-- CreateEnum
CREATE TYPE "ApiClientEnvironment" AS ENUM ('test', 'live');

-- CreateEnum
CREATE TYPE "ApiOperationStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "ApiIdempotencyStatus" AS ENUM ('processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivering', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "ApiClient" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "environment" "ApiClientEnvironment" NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "allLocations" BOOLEAN NOT NULL DEFAULT false,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
  "id" TEXT NOT NULL,
  "apiClientId" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClientLocation" (
  "apiClientId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiClientLocation_pkey" PRIMARY KEY ("apiClientId", "locationId")
);

-- CreateTable
CREATE TABLE "ApiOperation" (
  "id" TEXT NOT NULL,
  "apiClientId" TEXT NOT NULL,
  "apiCredentialId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "ApiOperationStatus" NOT NULL DEFAULT 'queued',
  "resourceType" TEXT,
  "resourceId" TEXT,
  "locationId" TEXT,
  "queueJobId" TEXT,
  "jobRunId" TEXT,
  "result" JSONB,
  "error" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiIdempotencyRecord" (
  "id" TEXT NOT NULL,
  "apiClientId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status" "ApiIdempotencyStatus" NOT NULL DEFAULT 'processing',
  "responseStatus" INTEGER,
  "responseBody" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiAuditEvent" (
  "id" TEXT NOT NULL,
  "apiClientId" TEXT,
  "apiCredentialId" TEXT,
  "requestId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "result" TEXT NOT NULL,
  "httpStatus" INTEGER,
  "sourceIp" TEXT,
  "userAgent" TEXT,
  "durationMs" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "apiClientId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "events" TEXT[] NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiCredential_keyPrefix_key" ON "ApiCredential"("keyPrefix");
CREATE INDEX "ApiClient_environment_revokedAt_idx" ON "ApiClient"("environment", "revokedAt");
CREATE INDEX "ApiCredential_apiClientId_revokedAt_idx" ON "ApiCredential"("apiClientId", "revokedAt");
CREATE INDEX "ApiClientLocation_locationId_idx" ON "ApiClientLocation"("locationId");
CREATE INDEX "ApiOperation_apiClientId_createdAt_idx" ON "ApiOperation"("apiClientId", "createdAt");
CREATE INDEX "ApiOperation_jobRunId_idx" ON "ApiOperation"("jobRunId");
CREATE INDEX "ApiOperation_queueJobId_idx" ON "ApiOperation"("queueJobId");
CREATE INDEX "ApiOperation_status_createdAt_idx" ON "ApiOperation"("status", "createdAt");
CREATE UNIQUE INDEX "ApiIdempotencyRecord_operationId_key" ON "ApiIdempotencyRecord"("operationId");
CREATE UNIQUE INDEX "ApiIdempotencyRecord_apiClientId_action_idempotencyKey_key" ON "ApiIdempotencyRecord"("apiClientId", "action", "idempotencyKey");
CREATE INDEX "ApiIdempotencyRecord_expiresAt_idx" ON "ApiIdempotencyRecord"("expiresAt");
CREATE INDEX "ApiAuditEvent_apiClientId_createdAt_idx" ON "ApiAuditEvent"("apiClientId", "createdAt");
CREATE INDEX "ApiAuditEvent_requestId_idx" ON "ApiAuditEvent"("requestId");
CREATE INDEX "ApiAuditEvent_createdAt_idx" ON "ApiAuditEvent"("createdAt");
CREATE INDEX "WebhookEndpoint_apiClientId_active_idx" ON "WebhookEndpoint"("apiClientId", "active");
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiClientLocation" ADD CONSTRAINT "ApiClientLocation_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiClientLocation" ADD CONSTRAINT "ApiClientLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiOperation" ADD CONSTRAINT "ApiOperation_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiOperation" ADD CONSTRAINT "ApiOperation_apiCredentialId_fkey" FOREIGN KEY ("apiCredentialId") REFERENCES "ApiCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiIdempotencyRecord" ADD CONSTRAINT "ApiIdempotencyRecord_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiIdempotencyRecord" ADD CONSTRAINT "ApiIdempotencyRecord_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ApiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiAuditEvent" ADD CONSTRAINT "ApiAuditEvent_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiAuditEvent" ADD CONSTRAINT "ApiAuditEvent_apiCredentialId_fkey" FOREIGN KEY ("apiCredentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
