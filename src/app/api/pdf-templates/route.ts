import { db } from '@/lib/db';
import { api, requireAdmin, requireStaff, readJson } from '@/lib/security';
import { builtinPdfTemplates, pdfTemplateSchema } from '@/lib/pdf-template';
export const GET = api(async (request) => {
  await requireStaff(request);
  const saved = await db.pdfTemplate.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
  return Response.json([...builtinPdfTemplates, ...saved.map((t) => ({ ...t, builtin: false }))]);
});
export const POST = api(async (request) => {
  await requireAdmin(request);
  const input = pdfTemplateSchema.parse(await readJson(request));
  return Response.json(await db.pdfTemplate.create({ data: input }), { status: 201 });
});
