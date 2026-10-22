import { db } from '@/lib/db';
import { api, ApiError, requireAdmin, readJson } from '@/lib/security';
import { builtinPdfTemplates, pdfTemplateSchema } from '@/lib/pdf-template';
import { Prisma } from '@prisma/client';
async function editable(id: string) {
  if (builtinPdfTemplates.some((t) => t.id === id))
    throw new ApiError(403, 'Dupliquez ce modèle intégré pour le personnaliser.');
  if (!(await db.pdfTemplate.findUnique({ where: { id } })))
    throw new ApiError(404, 'Modèle PDF introuvable.');
}
export const PUT = api<{ id: string }>(async (request, context) => {
  await requireAdmin(request);
  const { id } = await context.params;
  const input = pdfTemplateSchema.parse(await readJson(request));
  await editable(id);
  return Response.json(await db.pdfTemplate.update({ where: { id }, data: input }));
});
export const DELETE = api<{ id: string }>(async (request, context) => {
  await requireAdmin(request);
  const { id } = await context.params;
  await editable(id);
  try {
    await db.pdfTemplate.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
      throw new ApiError(
        409,
        'Ce modèle est utilisé par une session. Choisissez un autre modèle dans cette session avant de le supprimer.',
      );
    throw error;
  }
  return new Response(null, { status: 204 });
});
