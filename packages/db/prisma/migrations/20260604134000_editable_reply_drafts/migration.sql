ALTER TABLE "ReplyDraft" ADD COLUMN "aiBody" TEXT;
ALTER TABLE "ReplyDraft" ADD COLUMN "userEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReplyDraft" ADD COLUMN "editedAt" TIMESTAMP(3);

UPDATE "ReplyDraft" SET "aiBody" = "body" WHERE "aiBody" IS NULL;

ALTER TABLE "ReplyDraft" ALTER COLUMN "aiBody" SET NOT NULL;
