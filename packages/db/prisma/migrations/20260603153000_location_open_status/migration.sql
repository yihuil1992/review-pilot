ALTER TABLE "BusinessLocation" ADD COLUMN "googleOpenStatus" TEXT;

CREATE INDEX "BusinessLocation_googleOpenStatus_idx" ON "BusinessLocation"("googleOpenStatus");
