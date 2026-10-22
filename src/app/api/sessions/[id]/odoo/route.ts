import { after } from 'next/server';
import { api, ApiError, requireStaff, rateLimit } from '@/lib/security';
import { db } from '@/lib/db';
import { getOdooConfig } from '@/lib/odoo-config';
import { lockSession } from '@/lib/sessions';
import { deliverOdoo, odooStatus, queueOdoo } from '@/lib/odoo';
export const maxDuration = 120;
export const GET = api<{ id: string }>(async (request, context) => {
  await requireStaff(request);
  const { id } = await context.params;
  if (!(await db.trainingSession.count({ where: { id } })))
    throw new ApiError(404, 'Session introuvable.');
  return Response.json(
    await odooStatus(id, new URL(request.url).searchParams.get('includeUrl') === 'true'),
  );
});
export const POST = api<{ id: string }>(async (request, context) => {
  const admin = await requireStaff(request);
  await rateLimit(`odoo:${admin.id}`, 5, 300);
  const { id } = await context.params;
  const config = await getOdooConfig(id);
  if (!config)
    throw new ApiError(
      400,
      'Ajoutez un lien Odoo et activez l’intégration dans les paramètres de cette session.',
    );
  await db.$transaction(
    async (tx) => {
      await lockSession(tx, id);
      const responses = await tx.response.findMany({
        where: { sessionId: id },
        select: { id: true },
      });
      for (const response of responses) await queueOdoo(tx, id, response.id);
    },
    { timeout: 15000 },
  );
  await db.webhookDelivery.updateMany({
    where: {
      id: { startsWith: 'odoo:' },
      deliveredAt: null,
      AND: [
        { payload: { path: ['sessionId'], equals: id } },
        { payload: { path: ['state'], equals: 'FAILED' } },
      ],
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
    },
    data: { nextAttemptAt: new Date(0) },
  });
  after(async () => {
    try {
      await deliverOdoo(undefined, id);
    } catch {
      console.error('odoo_delivery_deferred');
    }
  });
  return Response.json(
    {
      queued: true,
      message: 'Traitement lancé. Les envois déjà confirmés ou incertains ne sont pas renvoyés.',
    },
    { status: 202 },
  );
});
