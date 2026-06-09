ALTER TABLE "BusinessLocation" ADD COLUMN "notificationPhoneNumber" TEXT;

UPDATE "BusinessLocation"
SET "notificationPhoneNumber" = (
  SELECT "notifyToNumber"
  FROM "TwilioConfig"
  WHERE "id" = 'singleton'
)
WHERE "notificationPhoneNumber" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "TwilioConfig"
    WHERE "id" = 'singleton'
      AND "notifyToNumber" IS NOT NULL
      AND "notifyToNumber" <> ''
  );
