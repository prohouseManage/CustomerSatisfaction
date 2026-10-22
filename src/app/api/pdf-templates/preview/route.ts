import { z } from 'zod';
import { api, requireAdmin, readJson, rateLimit, ApiError } from '@/lib/security';
import { db } from '@/lib/db';
import { pdfTemplateSchema } from '@/lib/pdf-template';
import { participantPdf, pdfResponse } from '@/lib/participant-pdf';
import { baseUrl } from '@/lib/crypto';
export const maxDuration = 60;
export const POST = api(async (request) => {
  const admin = await requireAdmin(request);
  await rateLimit(`pdf-preview:${admin.id}`, 20, 300);
  const input = z
    .object({ template: pdfTemplateSchema, sessionId: z.string().max(100).optional() })
    .strict()
    .parse(await readJson(request));
  const session = input.sessionId
    ? await db.trainingSession.findUnique({ where: { id: input.sessionId } })
    : {
        id: 'DORA-2026-001',
        name: 'DORA Foundation',
        trainer: 'Jean Dupont',
        date: '2026-12-11',
        description: 'Développez vos compétences avec House of Training.',
      };
  if (!session) throw new ApiError(404, 'Session introuvable.');
  return pdfResponse(
    await participantPdf(
      session,
      [
        {
          firstName: 'Marie',
          lastName: 'Martin',
          email: 'marie.martin@example.com',
          link: `${baseUrl()}/demo/form`,
          submittedAt: null,
        },
      ],
      input.template,
      true,
    ),
    'apercu-modele.pdf',
    true,
  );
});
