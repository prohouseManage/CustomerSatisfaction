ALTER TABLE "TrainingSession" ADD COLUMN "responseDeadline" DATE;
ALTER TABLE "EmailDelivery"
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "EmailDelivery_providerMessageId_key" ON "EmailDelivery"("providerMessageId");
CREATE TABLE "EmailDeliveryEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deliveryId" TEXT NOT NULL REFERENCES "EmailDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailDeliveryEvent_deliveryId_occurredAt_idx" ON "EmailDeliveryEvent"("deliveryId", "occurredAt");
ALTER TABLE "EmailDeliveryEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EmailDeliveryEvent" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "EmailDeliveryEvent" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "EmailDeliveryEvent" FROM authenticated;
  END IF;
END $$;
