ALTER TABLE "Review" ADD COLUMN "notificationStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Review" ADD COLUMN "notificationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Review" ADD COLUMN "notificationLastError" TEXT;

UPDATE "Review"
SET "notificationStatus" =
  CASE
    WHEN "notified" = true THEN 'sent'
    WHEN "notifyAt" IS NOT NULL THEN 'pending'
    ELSE 'none'
  END;

CREATE INDEX "Review_notificationStatus_notifyAt_idx" ON "Review"("notificationStatus", "notifyAt");
