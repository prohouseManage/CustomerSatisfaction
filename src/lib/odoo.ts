import { Prisma } from '@prisma/client';
import { db } from './db';
import { OdooError, odooConfig, prepareOdoo, type OdooEvaluation } from './odoo-client';
import { getOdooConfig } from './odoo-config';
import type { Answer } from './validation';
import { decryptToken } from './crypto';

export const ODOO_PREFIX = 'odoo:';
export const powerAutomateOnly = { NOT: { id: { startsWith: ODOO_PREFIX } } };
type OdooJob = {
  destination: 'odoo-uat' | 'odoo';
  sessionId: string;
  responseId: string;
  targetSessionId: string;
  fingerprint: string;
  state: 'PENDING' | 'VERIFYING' | 'POSTING' | 'SENT' | 'FAILED' | 'UNKNOWN';
};
export async function queueOdoo(
  tx: Prisma.TransactionClient,
  sessionId: string,
  responseId: string,
) {
  const config = await getOdooConfig(sessionId, tx);
  if (!config) return false;
  const payload: OdooJob = {
    destination: 'odoo',
    sessionId,
    responseId,
    targetSessionId: config.targetSessionId,
    fingerprint: config.fingerprint,
    state: 'PENDING',
  };
  const existing = await tx.webhookDelivery.findUnique({
    where: { id: `${ODOO_PREFIX}${responseId}` },
  });
  if (existing) {
    // Explicitly queueing pending responses may rebind jobs that have never reached POST.
    await tx.webhookDelivery.updateMany({
      where: {
        id: existing.id,
        deliveredAt: null,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
        AND: [
          {
            OR: ['PENDING', 'FAILED'].map((state) => ({
              payload: { path: ['state'], equals: state },
            })),
          },
        ],
      },
      data: { payload, nextAttemptAt: new Date(0), lastError: null },
    });
    return true;
  }
  await tx.webhookDelivery.upsert({
    where: { id: `${ODOO_PREFIX}${responseId}` },
    create: { id: `${ODOO_PREFIX}${responseId}`, payload, nextAttemptAt: new Date(0) },
    update: {},
  });
  return true;
}
export async function odooEvaluation(responseId: string): Promise<OdooEvaluation> {
  const response = await db.response.findUniqueOrThrow({
    where: { id: responseId },
    include: { participant: true, session: { include: { questions: true } } },
  });
  return {
    id: response.id,
    participant: response.participant,
    questions: response.session.questions,
    answers: response.answers as Answer[],
  };
}
export async function deliverOdoo(responseId?: string, onlySessionId?: string) {
  const connected = await db.odooConnection.findMany({
    where: { enabled: true, ...(onlySessionId ? { sessionId: onlySessionId } : {}) },
    select: { sessionId: true },
  });
  const sessionIds = connected.map((c) => c.sessionId);
  const legacy = odooConfig();
  if (
    legacy &&
    (!onlySessionId || legacy.sourceSessionId === onlySessionId) &&
    !(await db.odooConnection.count({ where: { sessionId: legacy.sourceSessionId } }))
  )
    sessionIds.push(legacy.sourceSessionId);
  if (!sessionIds.length) return;
  const now = new Date();
  const eligible: Prisma.WebhookDeliveryWhereInput = {
    id: responseId ? `${ODOO_PREFIX}${responseId}` : { startsWith: ODOO_PREFIX },
    deliveredAt: null,
    nextAttemptAt: { lte: now },
    AND: [
      { OR: sessionIds.map((id) => ({ payload: { path: ['sessionId'], equals: id } })) },
      {
        OR: ['PENDING', 'VERIFYING', 'FAILED'].map((state) => ({
          payload: { path: ['state'], equals: state },
        })),
      },
      { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    ],
  };
  // POSTING is deliberately excluded, including after a worker crash or lease expiry.
  const jobs = await db.webhookDelivery.findMany({
    where: eligible,
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  for (const record of jobs) {
    const job = record.payload as unknown as OdooJob;
    const config = await getOdooConfig(job.sessionId);
    if (!config) continue;
    const leaseUntil = new Date(Date.now() + 90000);
    const claimed = await db.webhookDelivery.updateMany({
      where: { ...eligible, id: record.id },
      data: {
        lockedUntil: leaseUntil,
        attempts: { increment: 1 },
        payload: { ...job, state: 'VERIFYING' },
      },
    });
    if (!claimed.count) continue;
    let posting = false;
    try {
      if (job.fingerprint !== config.fingerprint || job.targetSessionId !== config.targetSessionId)
        throw new OdooError(
          'La cible Odoo a changé. Cet envoi reste bloqué sur sa cible initiale.',
        );
      const evaluation = await odooEvaluation(job.responseId);
      const prepared = await prepareOdoo(config, evaluation);
      const transition = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "TrainingSession" WHERE id = ${job.sessionId} FOR UPDATE`;
        const current = await getOdooConfig(job.sessionId, tx);
        if (!current || current.fingerprint !== config.fingerprint)
          throw new OdooError(
            'Le lien Odoo a été modifié ou désactivé pendant la vérification. Aucun envoi effectué.',
          );
        return tx.webhookDelivery.updateMany({
          where: {
            id: record.id,
            lockedUntil: leaseUntil,
            deliveredAt: null,
            payload: { path: ['state'], equals: 'VERIFYING' },
          },
          data: { payload: { ...job, state: 'POSTING' } },
        });
      });
      if (!transition.count) continue; // Another worker owns the lease; this worker must never POST.
      posting = true;
      await prepared.send();
      await db.webhookDelivery.updateMany({
        where: { id: record.id, lockedUntil: leaseUntil },
        data: {
          deliveredAt: new Date(),
          lockedUntil: null,
          lastError: null,
          payload: { ...job, state: 'SENT' },
        },
      });
    } catch (error) {
      await db.webhookDelivery.updateMany({
        where: { id: record.id, lockedUntil: leaseUntil },
        data: {
          lockedUntil: null,
          payload: { ...job, state: posting ? 'UNKNOWN' : 'FAILED' },
          lastError:
            error instanceof OdooError
              ? error.message
              : posting
                ? 'Résultat incertain. Vérifier dans Odoo avant tout nouvel envoi.'
                : 'Préparation Odoo indisponible. Aucun envoi effectué.',
          nextAttemptAt: new Date(
            Date.now() + Math.min(86400, 60 * 2 ** Math.min(record.attempts, 10)) * 1000,
          ),
        },
      });
    }
  }
}
export async function odooStatus(sessionId: string, includeUrl = false) {
  const config = await getOdooConfig(sessionId);
  const connection = includeUrl
    ? await db.odooConnection.findUnique({ where: { sessionId } })
    : null;
  const where: Prisma.WebhookDeliveryWhereInput = {
    id: { startsWith: ODOO_PREFIX },
    payload: { path: ['sessionId'], equals: sessionId },
  };
  const count = (states: string[]) =>
    db.webhookDelivery.count({
      where: {
        ...where,
        OR: states.map((state) => ({ payload: { path: ['state'], equals: state } })),
      },
    });
  const [sent, pending, failed, uncertain, last] = await Promise.all([
    count(['SENT']),
    count(['PENDING', 'VERIFYING']),
    count(['FAILED']),
    count(['UNKNOWN', 'POSTING']),
    db.webhookDelivery.findFirst({
      where: { ...where, lastError: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { lastError: true },
    }),
  ]);
  return {
    configured: !!config,
    targetSessionId: config?.targetSessionId ?? null,
    environment: config
      ? new URL(config.url).hostname === 'odoo.uat.houseoftraining.lu'
        ? 'Préproduction'
        : 'Production'
      : null,
    ...(includeUrl
      ? {
          url: connection ? decryptToken(connection.urlEncrypted) : config?.url || '',
          enabled: connection?.enabled ?? !!config,
        }
      : {}),
    sent,
    pending,
    failed,
    uncertain,
    lastError: last?.lastError || null,
  };
}
