import { after } from 'next/server';
import { z } from 'zod';
import { api, ApiError, requireStaff, readJson, rateLimit } from '@/lib/security';
import {
  emailOverview,
  queueManualEmails,
  deliverEmails,
  applySessionEmailTransition,
} from '@/lib/emails';
import { emailReactivationSchema } from '@/lib/email-policy';
import { db } from '@/lib/db';
import { lockSession } from '@/lib/sessions';
export const maxDuration = 300;
export const GET = api<{ id: string }>(async (request, context) => {
  await requireStaff(request);
  return Response.json(await emailOverview((await context.params).id));
});
export const PUT = api<{ id: string }>(async (request, context) => {
  await requireStaff(request);
  const choice = emailReactivationSchema.parse(await readJson(request));
  const { id } = await context.params;
  await db.$transaction(async (tx) => {
    const session = await lockSession(tx, id);
    if (session.status !== 'ACTIVE')
      throw new ApiError(409, 'Réactivez la session avant de reprogrammer ses e-mails.');
    await applySessionEmailTransition(tx, id, session.status, session.status, choice);
    await tx.trainingSession.update({
      where: { id },
      data: { integrationRevision: { increment: 1 } },
    });
  });
  return Response.json(await emailOverview(id));
});
export const POST = api<{ id: string }>(async (request, context) => {
  const admin = await requireStaff(request);
  await rateLimit(`manual-email:${admin.id}`, 6, 300);
  const input = z
    .object({
      confirmation: z.literal('envoyer les invitations'),
      participantId: z.string().uuid().optional(),
    })
    .strict()
    .parse(await readJson(request));
  const { id } = await context.params;
  const result = await queueManualEmails(id, input.participantId, admin.id);
  after(async () => {
    try {
      await deliverEmails(id);
    } catch {
      console.error('email_delivery_deferred');
    }
  });
  return Response.json(
    {
      ...result,
      message: `${result.queued} e-mail(s) mis en attente d’envoi. ${result.skipped} destinataire(s) déjà en cours, à vérifier ou contacté(s) depuis moins de cinq minutes.`,
    },
    { status: 202 },
  );
});
