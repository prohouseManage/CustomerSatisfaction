import { api, ApiError, requireAdmin } from '@/lib/security';
import { parseParticipants } from '@/lib/excel';
import { db } from '@/lib/db';
import { lockSession } from '@/lib/sessions';
import { generateToken, hashToken, encryptToken } from '@/lib/crypto';
import { queueSessionIntegration } from '@/lib/power-automate';
import { after } from 'next/server';
import { deliverWebhooks } from '@/lib/webhooks';
export const maxDuration = 60;
export const POST = api(async (request) => {
  await requireAdmin(request);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Fichier manquant.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_100_000) {
      await reader.cancel();
      throw new ApiError(413, 'Taille maximale : 2 Mo.');
    }
    chunks.push(value);
  }
  const form = await new Request(request.url, {
    method: 'POST',
    headers: { 'content-type': request.headers.get('content-type') || '' },
    body: Buffer.concat(chunks),
  }).formData();
  const sessionId = String(form.get('sessionId') || ''),
    file = form.get('file');
  if (
    !sessionId ||
    !(file instanceof File) ||
    !file.name.toLowerCase().endsWith('.xlsx') ||
    file.size < 4
  )
    throw new ApiError(400, 'Session et fichier .xlsx requis.');
  let rows;
  try {
    rows = parseParticipants(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : 'Fichier invalide.');
  }
  const result = await db.$transaction(
    async (tx) => {
      const session = await lockSession(tx, sessionId);
      if (session.status === 'ARCHIVED') throw new ApiError(409, 'Cette session est archivée.');
      const existing = new Set(
        (await tx.participant.findMany({ where: { sessionId }, select: { email: true } })).map(
          (p) => p.email,
        ),
      );
      const fresh = rows.filter((p) => !existing.has(p.email));
      const data = fresh.map((p) => {
        const token = generateToken();
        return {
          ...p,
          sessionId,
          tokenHash: hashToken(token),
          tokenEncrypted: encryptToken(token),
        };
      });
      let eventId: string | undefined;
      if (data.length) {
        await tx.participant.createMany({ data });
        await tx.trainingSession.update({
          where: { id: sessionId },
          data: { integrationRevision: { increment: 1 } },
        });
        eventId = await queueSessionIntegration(tx, sessionId);
      }
      return { imported: data.length, skipped: rows.length - data.length, eventId };
    },
    { timeout: 20000 },
  );
  if (result.eventId)
    after(async () => {
      try {
        await deliverWebhooks(result.eventId);
      } catch {
        console.error('webhook_delivery_deferred');
      }
    });
  return Response.json({ imported: result.imported, skipped: result.skipped }, { status: 201 });
});
