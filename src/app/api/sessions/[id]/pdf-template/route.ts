import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { api, ApiError, requireAdmin, readJson } from '@/lib/security';
import { db } from '@/lib/db';
import { builtinPdfTemplates } from '@/lib/pdf-template';
import { resolvePdfTemplate } from '@/lib/pdf-templates-server';
import { lockSession, sessionInclude } from '@/lib/sessions';

export const PUT = api<{ id: string }>(async (request, context) => {
  await requireAdmin(request);
  const { id } = await context.params;
  const { templateId } = z
    .object({ templateId: z.string().min(1).max(100) })
    .strict()
    .parse(await readJson(request));
  await resolvePdfTemplate(templateId);
  const preset = builtinPdfTemplates.some((t) => t.id === templateId);
  try {
    const session = await db.$transaction(async (tx) => {
      await lockSession(tx, id);
      return tx.trainingSession.update({
        where: { id },
        data: preset
          ? { pdfTemplateId: null, pdfPreset: templateId }
          : { pdfTemplateId: templateId },
        include: sessionInclude,
      });
    });
    return Response.json(session);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
      throw new ApiError(409, 'Ce modèle a été supprimé. Rechargez la liste des modèles.');
    throw error;
  }
});
