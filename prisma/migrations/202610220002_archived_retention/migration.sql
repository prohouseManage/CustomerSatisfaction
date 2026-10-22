ALTER TABLE "TrainingSession" ADD COLUMN "archivedAt" TIMESTAMP(3);
-- The actual archive date was not previously recorded. Start a fresh retention period.
UPDATE "TrainingSession" SET "archivedAt" = CURRENT_TIMESTAMP WHERE "status" = 'ARCHIVED';
CREATE INDEX "TrainingSession_status_archivedAt_idx" ON "TrainingSession"("status", "archivedAt");
CREATE TABLE "RetentionSettings" (
  "id" TEXT NOT NULL DEFAULT 'retention',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "value" INTEGER NOT NULL DEFAULT 2,
  "unit" TEXT NOT NULL DEFAULT 'MONTHS',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RetentionSettings_singleton_check" CHECK ("id" = 'retention'),
  CONSTRAINT "RetentionSettings_value_check" CHECK ("value" BETWEEN 1 AND 10000),
  CONSTRAINT "RetentionSettings_unit_check" CHECK ("unit" IN ('DAYS', 'MONTHS', 'YEARS'))
);
INSERT INTO "RetentionSettings" ("id", "updatedAt") VALUES ('retention', CURRENT_TIMESTAMP);
ALTER TABLE "RetentionSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RetentionSettings" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "RetentionSettings" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "RetentionSettings" FROM authenticated;
  END IF;
END $$;
