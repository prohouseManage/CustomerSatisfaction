import { db } from './db';
import { ApiError } from './security';
import {
  builtinPdfTemplates,
  pdfTemplateSchema,
  templateInput,
  type PdfTemplateInput,
} from './pdf-template';
export async function resolvePdfTemplate(
  id = builtinPdfTemplates[0].id,
): Promise<PdfTemplateInput> {
  const builtin = builtinPdfTemplates.find((t) => t.id === id);
  if (builtin) return templateInput(builtin);
  const saved = await db.pdfTemplate.findUnique({ where: { id } });
  if (!saved) throw new ApiError(404, 'Modèle PDF introuvable.');
  return pdfTemplateSchema.parse(templateInput(saved as PdfTemplateInput));
}
