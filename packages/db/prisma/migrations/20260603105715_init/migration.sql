-- Initial production schema for Review Pilot.
CREATE TYPE "ReviewStatus" AS ENUM ('new', 'analysis_pending', 'draft_ready', 'regeneration_pending', 'publishing', 'published', 'manual_handled', 'deferred', 'failed');
CREATE TYPE "ReviewSeverity" AS ENUM ('green', 'yellow', 'red');
CREATE TYPE "ReviewPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE "OwnerUser" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "SecretValue" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecretValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoogleAccount" (
  "id" TEXT NOT NULL,
  "googleUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "refreshTokenSecretId" TEXT NOT NULL,
  "accessTokenEncrypted" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessLocation" (
  "id" TEXT NOT NULL,
  "googleAccountId" TEXT NOT NULL,
  "googleLocationName" TEXT NOT NULL,
  "googleAccountName" TEXT,
  "placeId" TEXT,
  "businessName" TEXT NOT NULL,
  "address" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
  "id" TEXT NOT NULL,
  "businessLocationId" TEXT NOT NULL,
  "googleReviewId" TEXT NOT NULL,
  "authorName" TEXT,
  "rating" INTEGER NOT NULL,
  "reviewText" TEXT,
  "reviewCreatedAt" TIMESTAMP(3),
  "status" "ReviewStatus" NOT NULL DEFAULT 'new',
  "latestDraftId" TEXT,
  "publishedReply" TEXT,
  "replyPublishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewAnalysis" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "severity" "ReviewSeverity" NOT NULL,
  "priority" "ReviewPriority" NOT NULL,
  "issues" TEXT[],
  "positives" TEXT[],
  "keywords" TEXT[],
  "publishRisk" JSONB NOT NULL,
  "reasoning" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReplyDraft" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "instruction" TEXT,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplyDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewAction" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobRun" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "promptVersion" TEXT,
  "outputSchemaVersion" TEXT,
  "transcript" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TwilioConfig" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "accountSid" TEXT NOT NULL,
  "authTokenSecretId" TEXT NOT NULL,
  "fromNumber" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TwilioConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemLog" (
  "id" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecretValue_scope_key_key" ON "SecretValue"("scope", "key");
CREATE UNIQUE INDEX "GoogleAccount_googleUserId_key" ON "GoogleAccount"("googleUserId");
CREATE UNIQUE INDEX "BusinessLocation_googleAccountId_googleLocationName_key" ON "BusinessLocation"("googleAccountId", "googleLocationName");
CREATE INDEX "BusinessLocation_enabled_idx" ON "BusinessLocation"("enabled");
CREATE UNIQUE INDEX "Review_businessLocationId_googleReviewId_key" ON "Review"("businessLocationId", "googleReviewId");
CREATE INDEX "Review_status_idx" ON "Review"("status");
CREATE UNIQUE INDEX "ReviewAnalysis_reviewId_key" ON "ReviewAnalysis"("reviewId");
CREATE UNIQUE INDEX "ReplyDraft_reviewId_version_key" ON "ReplyDraft"("reviewId", "version");
CREATE INDEX "ReviewAction_reviewId_createdAt_idx" ON "ReviewAction"("reviewId", "createdAt");
CREATE INDEX "JobRun_type_status_idx" ON "JobRun"("type", "status");
CREATE INDEX "JobRun_reviewId_idx" ON "JobRun"("reviewId");
CREATE INDEX "SystemLog_level_createdAt_idx" ON "SystemLog"("level", "createdAt");

ALTER TABLE "GoogleAccount" ADD CONSTRAINT "GoogleAccount_refreshTokenSecretId_fkey" FOREIGN KEY ("refreshTokenSecretId") REFERENCES "SecretValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewAnalysis" ADD CONSTRAINT "ReviewAnalysis_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TwilioConfig" ADD CONSTRAINT "TwilioConfig_authTokenSecretId_fkey" FOREIGN KEY ("authTokenSecretId") REFERENCES "SecretValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
