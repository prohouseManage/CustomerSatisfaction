ALTER TABLE "Question" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Response" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE "Response" ADD CONSTRAINT "Response_language" CHECK ("language" IN ('fr','de','en'));
CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "steps" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "AutomationRun_status" CHECK ("status" IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','TIMED_OUT'))
);
CREATE INDEX "AutomationRun_startedAt_idx" ON "AutomationRun"("startedAt");
CREATE INDEX "AutomationRun_status_startedAt_idx" ON "AutomationRun"("status","startedAt");
ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "AutomationRun" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "AutomationRun" FROM authenticated; END IF;
END $$;
