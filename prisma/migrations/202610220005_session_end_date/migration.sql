ALTER TABLE "TrainingSession" ADD COLUMN "endDate" DATE;
UPDATE "TrainingSession" SET "endDate" = "date";
-- NULL retains compatibility with older imports and means a single-day session.
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_dates_order"
  CHECK ("endDate" IS NULL OR "endDate" >= "date");
