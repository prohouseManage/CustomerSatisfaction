CREATE TABLE "OdooConnection" (
  "sessionId" TEXT NOT NULL,
  "urlEncrypted" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OdooConnection_pkey" PRIMARY KEY ("sessionId"),
  CONSTRAINT "OdooConnection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "OdooConnection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "OdooConnection" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "OdooConnection" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "OdooConnection" FROM authenticated;
  END IF;
END $$;
