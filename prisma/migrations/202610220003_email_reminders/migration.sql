CREATE TABLE "EmailSettings" (
  "id" TEXT NOT NULL DEFAULT 'email', "enabled" BOOLEAN NOT NULL DEFAULT false,
  "delayDays" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailSettings_delay" CHECK ("delayDays" BETWEEN 1 AND 365)
);
CREATE TABLE "SessionEmailSchedule" (
  "sessionId" TEXT NOT NULL, "mode" TEXT NOT NULL DEFAULT 'INHERIT',
  "delayDays" INTEGER, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionEmailSchedule_pkey" PRIMARY KEY ("sessionId"),
  CONSTRAINT "SessionEmailSchedule_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionEmailSchedule_policy" CHECK ("mode" IN ('INHERIT','CUSTOM','OFF') AND ("mode" <> 'CUSTOM' OR ("delayDays" IS NOT NULL AND "delayDays" BETWEEN 1 AND 365)))
);
CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "participantId" TEXT NOT NULL,
  "automaticKey" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "lockedUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailDelivery_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailDelivery_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailDelivery_status" CHECK ("status" IN ('PENDING','SENDING','SENT','FAILED','UNKNOWN','CANCELLED'))
);
CREATE UNIQUE INDEX "EmailDelivery_automaticKey_key" ON "EmailDelivery"("automaticKey");
CREATE INDEX "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status","createdAt");
CREATE INDEX "EmailDelivery_sessionId_participantId_idx" ON "EmailDelivery"("sessionId","participantId");
ALTER TABLE "EmailSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SessionEmailSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailDelivery" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "EmailSettings","SessionEmailSchedule","EmailDelivery" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "EmailSettings","SessionEmailSchedule","EmailDelivery" FROM authenticated;
  END IF;
END $$;
