import { api, ApiError, requireStaff, readJson } from '@/lib/security';
import { sessionSchema } from '@/lib/validation';
import { db } from '@/lib/db';
import { lockSession, sessionInclude } from '@/lib/sessions';
import { queueSessionIntegration } from '@/lib/power-automate';
import { after } from 'next/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { saveOdooConnection } from '@/lib/odoo-config';
import { archiveTimestamp, deletionSchema } from '@/lib/retention-policy';
import { deleteArchivedSession } from '@/lib/retention';
import { ipHash } from '@/lib/security';
import { saveEmailSchedule, applySessionEmailTransition } from '@/lib/emails';
export const maxDuration = 60;
export const GET = api<{ id: string }>(async (request, context) => {
  await requireStaff(request);
  const { id } = await context.params;
  const session = await db.trainingSession.findUnique({ where: { id }, include: sessionInclude });
  if (!session) throw new ApiError(404, 'Session introuvable.');
  return Response.json(session);
});
export const PATCH = api<{ id: string }>(async (request, context) => {
  await requireStaff(request);
  const { id } = await context.params;
  const {
    questions,
    date,
    endDate,
    id: newId,
    odooUrl,
    odooEnabled,
    emailSchedule,
    emailReactivation,
    ...data
  } = sessionSchema.parse(await readJson(request));
  if (newId !== id) throw new ApiError(400, 'L’identifiant de session est immuable.');
  const { session, eventId } = await db.$transaction(async (tx) => {
    const current = await lockSession(tx, id);
    const end =
      endDate === undefined ? current.endDate || new Date(date) : new Date(endDate || date);
    if (end < new Date(date))
      throw new ApiError(400, 'La date de fin doit être égale ou postérieure à la date de début.');
    const normalized = current.questions.map((q) => ({
      label: q.label,
      type: q.type,
      required: q.required,
      options: q.options,
    }));
    const core = questions.map(({ label, type, required, options }) => ({
      label,
      type,
      required,
      options,
    }));
    const changed = JSON.stringify(normalized) !== JSON.stringify(core);
    if (current._count.participants && changed)
      throw new ApiError(
        409,
        'Le questionnaire est verrouillé après le premier import de participants.',
      );
    if (changed) {
      await tx.question.deleteMany({ where: { sessionId: id } });
      await tx.question.createMany({
        data: questions.map((q, position) => ({ ...q, sessionId: id, position })),
      });
    } else {
      for (let index = 0; index < questions.length; index++) {
        if (questions[index].translations !== undefined)
          await tx.question.update({
            where: { id: current.questions[index].id },
            data: { translations: questions[index].translations },
          });
      }
    }
    await saveEmailSchedule(tx, id, emailSchedule);
    await applySessionEmailTransition(tx, id, current.status, data.status, emailReactivation);
    const updated = await tx.trainingSession.update({
      where: { id },
      data: {
        ...data,
        date: new Date(date),
        endDate: end,
        archivedAt: archiveTimestamp(current.status, current.archivedAt, data.status),
        integrationRevision: { increment: 1 },
      },
      include: sessionInclude,
    });
    const eventId = await queueSessionIntegration(tx, id);
    await saveOdooConnection(tx, id, odooUrl, odooEnabled);
    return { session: updated, eventId };
  });
  if (eventId)
    after(async () => {
      try {
        await deliverWebhooks(eventId);
      } catch {
        console.error('webhook_delivery_deferred');
      }
    });
  return Response.json(session);
});
export const DELETE = api<{ id: string }>(async (request, context) => {
  const admin = await requireStaff(request);
  deletionSchema.parse(await readJson(request));
  const { id } = await context.params;
  const outcome = await db.$transaction(
    (tx) => deleteArchivedSession(tx, id, { actorId: admin.id, ipHash: ipHash(request.headers) }),
    { timeout: 15000 },
  );
  if (outcome === 'missing') throw new ApiError(404, 'Session introuvable.');
  if (outcome === 'notArchived')
    throw new ApiError(409, 'Archivez la session avant de la supprimer.');
  if (outcome === 'busy')
    throw new ApiError(409, 'Un envoi est en cours pour cette session. Réessayez après sa fin.');
  return new Response(null, { status: 204 });
});
