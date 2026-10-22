ALTER TABLE "SessionEmailSchedule" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "resumeOn" DATE;
ALTER TABLE "EmailDelivery" ADD COLUMN "notBefore" DATE;
ALTER TABLE "EmailDelivery" DROP CONSTRAINT "EmailDelivery_status";
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_status" CHECK ("status" IN ('PENDING','PAUSED','SENDING','SENT','FAILED','UNKNOWN','CANCELLED'));
-- Existing archives must not resume automatically when reactivated later.
INSERT INTO "SessionEmailSchedule" ("sessionId","mode","suspended","updatedAt")
  SELECT id,'INHERIT',true,NOW() FROM "TrainingSession" WHERE status='ARCHIVED'
  ON CONFLICT ("sessionId") DO UPDATE SET suspended=true,"resumeOn"=NULL;
UPDATE "EmailDelivery" SET status='PAUSED',"lastError"=NULL WHERE status='PENDING' AND "sessionId" IN (SELECT id FROM "TrainingSession" WHERE status='ARCHIVED');
