import { api, ApiError, requireStaff } from '@/lib/security';
import { db } from '@/lib/db';
import { baseUrl, decryptToken } from '@/lib/crypto';
import QRCode from 'qrcode';
export const GET = api<{ id: string }>(async (request, context) => {
  await requireStaff(request);
  const { id } = await context.params;
  const p = await db.participant.findUnique({ where: { id } });
  if (!p) throw new ApiError(404, 'Participant introuvable.');
  if (p.submittedAt) throw new ApiError(410, 'Ce questionnaire a déjà été complété.');
  const link = `${baseUrl()}/form/${encodeURIComponent(p.sessionId)}/${decryptToken(p.tokenEncrypted)}`;
  return Response.json({ link, qrCode: await QRCode.toDataURL(link, { width: 320, margin: 2 }) });
});
