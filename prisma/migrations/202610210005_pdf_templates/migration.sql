CREATE TABLE "PdfTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "heading" TEXT NOT NULL,
  "introduction" TEXT NOT NULL,
  "organizationText" TEXT NOT NULL,
  "footer" TEXT NOT NULL,
  "accentColor" TEXT NOT NULL,
  "layout" TEXT NOT NULL,
  "showEmail" BOOLEAN NOT NULL DEFAULT true,
  "showDescription" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PdfTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PdfTemplate_layout_check" CHECK ("layout" IN ('CLASSIC', 'BANNER')),
  CONSTRAINT "PdfTemplate_color_check" CHECK ("accentColor" ~ '^#[0-9a-fA-F]{6}$')
);
ALTER TABLE "PdfTemplate" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "PdfTemplate" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "PdfTemplate" FROM authenticated;
  END IF;
END $$;
REVOKE ALL ON TABLE "PdfTemplate" FROM PUBLIC;
