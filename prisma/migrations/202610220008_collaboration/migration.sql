CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'MANAGER');
ALTER TABLE "Admin" ADD COLUMN "role" "StaffRole" NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "StaffInvitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "role" "StaffRole" NOT NULL DEFAULT 'MANAGER',
  "tokenHash" TEXT NOT NULL,
  "tokenEncrypted" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "StaffInvitation_email_key" ON "StaffInvitation"("email");
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_createdAt_idx" ON "StaffInvitation"("createdAt");
ALTER TABLE "StaffInvitation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "StaffInvitation" FROM PUBLIC;
-- These roles exist in Supabase, but not in the isolated PostgreSQL test instances.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "StaffInvitation" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "StaffInvitation" FROM authenticated;
  END IF;
END $$;
