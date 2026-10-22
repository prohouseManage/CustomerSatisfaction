ALTER TABLE "TrainingSession"
  ADD COLUMN "pdfPreset" TEXT NOT NULL DEFAULT 'hot-classic',
  ADD COLUMN "pdfTemplateId" TEXT;
ALTER TABLE "TrainingSession"
  ADD CONSTRAINT "TrainingSession_pdfPreset_check" CHECK ("pdfPreset" IN ('hot-classic', 'hot-banner')),
  ADD CONSTRAINT "TrainingSession_pdfTemplateId_fkey" FOREIGN KEY ("pdfTemplateId") REFERENCES "PdfTemplate"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "TrainingSession_pdfTemplateId_idx" ON "TrainingSession"("pdfTemplateId");
