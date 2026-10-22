import { Prisma } from '@prisma/client';
import { db } from './db';
import {
  defaultRetention,
  retentionDeadline,
  retentionSchema,
  type RetentionPolicy,
} from './retention-policy';

export async function getRetentionPolicy(
  client: Prisma.TransactionClient = db,
): Promise<RetentionPolicy> {
  const saved = await client.retentionSettings.findUnique({
    where: { id: 'retention' },
    select: { enabled: true, value: true, unit: true },
  });
  return saved ? retentionSchema.parse(saved) : { ...defaultRetention };
}
function dueCondition(policy: RetentionPolicy, now: Date) {
  const interval =
    policy.unit === 'DAYS'
      ? Prisma.sql`${policy.value} * INTERVAL '1 day'`
      : policy.unit === 'MONTHS'
        ? Prisma.sql`${policy.value} * INTERVAL '1 month'`
        : Prisma.sql`${policy.value} * INTERVAL '1 year'`;
  return Prisma.sql`"status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL AND "archivedAt" + ${interval} <= ${now}`;
}
export async function retentionOverview(now = new Date()) {
  const policy = await getRetentionPolicy();
  const [archivedCount, due] = await Promise.all([
    db.trainingSession.count({ where: { status: 'ARCHIVED' } }),
    db.$queryRaw<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM "TrainingSession" WHERE ${dueCondition(policy, now)}`,
  ]);
  return { ...policy, archivedCount, dueCount: due[0].count };
}
type DeletionContext = { actorId?: string; ipHash: string; now?: Date; policy?: RetentionPolicy };
export async function deleteArchivedSession(
  tx: Prisma.TransactionClient,
  id: string,
  context: DeletionContext,
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "TrainingSession" WHERE id=${id} FOR UPDATE`;
  if (!rows.length) return 'missing' as const;
  const session = await tx.trainingSession.findUniqueOrThrow({
    where: { id },
    select: { status: true, archivedAt: true },
  });
  if (session.status !== 'ARCHIVED') return 'notArchived' as const;
  const now = context.now || new Date();
  if (
    context.policy &&
    (!session.archivedAt || retentionDeadline(session.archivedAt, context.policy) > now)
  )
    return 'notDue' as const;
  // Serialize against claims before removing personal copies from the outbox.
  await tx.$queryRaw`SELECT id FROM "WebhookDelivery" WHERE "payload"->>'sessionId'=${id} FOR UPDATE`;
  if (
    await tx.webhookDelivery.count({
      where: { payload: { path: ['sessionId'], equals: id }, lockedUntil: { gt: now } },
    })
  )
    return 'busy' as const;
  // Email workers claim under the same session lock before making a remote call.
  if (
    await tx.emailDelivery.count({
      where: { sessionId: id, status: 'SENDING', lockedUntil: { gt: now } },
    })
  )
    return 'busy' as const;
  await tx.webhookDelivery.deleteMany({ where: { payload: { path: ['sessionId'], equals: id } } });
  await tx.integrationEvent.deleteMany({ where: { payload: { path: ['sessionId'], equals: id } } });
  await tx.trainingSession.delete({ where: { id } });
  await tx.auditLog.create({
    data: {
      action: context.policy ? 'SESSION_AUTO_DELETED' : 'SESSION_MANUALLY_DELETED',
      actorId: context.actorId,
      resourceId: id,
      ipHash: context.ipHash,
    },
  });
  return 'deleted' as const;
}
export async function purgeArchivedSessions(now = new Date()) {
  return db.$transaction(
    async (tx) => {
      // Settings changes and cleanup are serialized, so disabling cannot race a cleanup batch.
      await tx.$queryRaw`SELECT id FROM "RetentionSettings" WHERE id='retention' FOR UPDATE`;
      const policy = await getRetentionPolicy(tx);
      if (!policy.enabled) return { enabled: false, deleted: 0, skipped: 0 };
      const candidates = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "TrainingSession" WHERE ${dueCondition(policy, now)} ORDER BY "archivedAt",id LIMIT 50`;
      let deleted = 0,
        skipped = 0;
      for (const candidate of candidates) {
        const outcome = await deleteArchivedSession(tx, candidate.id, {
          policy,
          now,
          ipHash: 'scheduled-retention',
        });
        if (outcome === 'deleted') deleted++;
        else skipped++;
      }
      return { enabled: true, deleted, skipped };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
