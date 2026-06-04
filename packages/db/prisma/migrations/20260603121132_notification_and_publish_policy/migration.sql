ALTER TABLE "Review" ADD COLUMN "notifyAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "notified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "notificationSentAt" TIMESTAMP(3);
ALTER TABLE "TwilioConfig" ADD COLUMN "notifyToNumber" TEXT;

CREATE INDEX "Review_notifyAt_notified_idx" ON "Review"("notifyAt", "notified");
