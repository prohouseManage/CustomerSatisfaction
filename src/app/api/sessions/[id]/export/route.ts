import { api, ApiError, requireAdmin, rateLimit } from '@/lib/security';
import { db } from '@/lib/db';
import { baseUrl, decryptToken } from '@/lib/crypto';
import { excelResponse } from '@/lib/excel';
import { participantPdf, pdfResponse } from '@/lib/participant-pdf';
import { resolvePdfTemplate } from '@/lib/pdf-templates-server';
import { sessionPdfTemplateKey } from '@/lib/pdf-template';
export const maxDuration = 60;
export const GET = api<{ id: string }>(async (request, context) => {
  const admin = await requireAdmin(request);
  await rateLimit(`export:${admin.id}`, 10, 300);
  const { id } = await context.params;
  const session = await db.trainingSession.findUnique({
    where: { id },
    include: {
      participants: { orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!session) throw new ApiError(404, 'Session introuvable.');
  const format = new URL(request.url).searchParams.get('format') || 'xlsx';
  const participants = session.participants.map((p) => ({
    ...p,
    link: `${baseUrl()}/form/${encodeURIComponent(id)}/${decryptToken(p.tokenEncrypted)}`,
  }));
  if (format === 'xlsx')
    return excelResponse(
      [
        {
          name: 'Liens participants',
          rows: participants.map((p) => ({
            ID: p.id,
            Nom: p.lastName,
            Prénom: p.firstName,
            Email: p.email,
            Session: id,
            Lien: p.link,
            Statut: p.submittedAt ? 'Répondu' : 'En attente',
          })),
        },
      ],
      `liens-${id}`,
    );
  if (format !== 'pdf') throw new ApiError(400, 'Formats acceptés : xlsx, pdf.');
  const template = await resolvePdfTemplate(
    new URL(request.url).searchParams.get('templateId') || sessionPdfTemplateKey(session),
  );
  return pdfResponse(await participantPdf(session, participants, template), `qr-${id}.pdf`);
});
