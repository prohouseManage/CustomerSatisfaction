import { api, ApiError, requireStaff, rateLimit, paginationPage } from '@/lib/security';
import { db } from '@/lib/db';
import { baseUrl, decryptToken } from '@/lib/crypto';
import { excelResponse } from '@/lib/excel';
import { participantPdf, pdfResponse } from '@/lib/participant-pdf';
import { resolvePdfTemplate } from '@/lib/pdf-templates-server';
import { sessionPdfTemplateKey } from '@/lib/pdf-template';
import { PDF_PARTICIPANTS_PER_FILE } from '@/lib/export-limits';
export const maxDuration = 60;
export const GET = api<{ id: string }>(async (request, context) => {
  const admin = await requireStaff(request);
  await rateLimit(`export:${admin.id}`, 10, 300);
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const format = params.get('format') || 'xlsx';
  if (!['xlsx', 'pdf'].includes(format)) throw new ApiError(400, 'Formats acceptés : xlsx, pdf.');
  const page = paginationPage(params);
  const total = await db.participant.count({ where: { sessionId: id } });
  if (format === 'xlsx' && total > 10000)
    throw new ApiError(413, 'Export limité à 10 000 liens par fichier.');
  if (format === 'pdf' && total > PDF_PARTICIPANTS_PER_FILE && !params.has('page'))
    throw new ApiError(
      413,
      'Téléchargez les fiches par lots de 250 participants depuis la session.',
    );
  const session = await db.trainingSession.findUnique({
    where: { id },
    include: {
      participants: {
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        ...(format === 'pdf'
          ? { take: PDF_PARTICIPANTS_PER_FILE, skip: (page - 1) * PDF_PARTICIPANTS_PER_FILE }
          : {}),
      },
    },
  });
  if (!session) throw new ApiError(404, 'Session introuvable.');
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
  if (!participants.length) throw new ApiError(400, 'Aucun participant dans ce lot.');
  return pdfResponse(
    await participantPdf(session, participants, template),
    `qr-${id}${total > PDF_PARTICIPANTS_PER_FILE ? `-lot-${page}` : ''}.pdf`,
  );
});
