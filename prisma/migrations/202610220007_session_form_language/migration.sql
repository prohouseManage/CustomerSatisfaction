ALTER TABLE "TrainingSession" ADD COLUMN "formLanguage" TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_formLanguage"
  CHECK ("formLanguage" IN ('fr','de','en','auto'));
