import { Prisma } from '@prisma/client';
import { db } from './db';
import { ApiError } from './security';
import { lockSession } from './sessions';
import { baseUrl, decryptToken } from './crypto';
import {
  defaultEmailPolicy,
  effectiveEmailPolicy,
  emailDueDate,
  luxembourgDate,
  invitationEmail,
  scheduledEmailDate,
  type EmailPolicy,
  type EmailSchedule,
  type SavedEmailSchedule,
  type EmailReactivation,
} from './email-policy';
import { smtpConfiguration, sendSmtpEmail, EmailSendError, type OutgoingEmail } from './email-smtp';

export function emailServiceStatus() {
  const configured = !!smtpConfiguration();
  const publicLinkReady =
    new URL(baseUrl()).protocol === 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl()).hostname);
  return { configured, publicLinkReady, ready: configured && publicLinkReady };
}
export async function getEmailPolicy(client: Prisma.TransactionClient = db): Promise<EmailPolicy> {
  const settings = await client.emailSettings.findUnique({ where: { id: 'email' } });
  return settings
    ? { enabled: settings.enabled, delayDays: settings.delayDays }
    : { ...defaultEmailPolicy };
}
export async function saveEmailSchedule(
  tx: Prisma.TransactionClient,
  sessionId: string,
  schedule?: EmailSchedule | null,
) {
  if (!schedule) return;
  const data = {
    mode: schedule.mode,
    delayDays: schedule.mode === 'CUSTOM' ? schedule.delayDays! : null,
  };
  await tx.sessionEmailSchedule.upsert({
    where: { sessionId },
    create: { sessionId, ...data },
    update: data,
  });
}
// Call while holding the session lock, in the same transaction as its status change.
export async function applySessionEmailTransition(
  tx: Prisma.TransactionClient,
  sessionId: string,
  previousStatus: string,
  nextStatus: string,
  reactivation?: EmailReactivation,
  now = new Date(),
) {
  if (nextStatus === 'ARCHIVED') {
    await tx.sessionEmailSchedule.upsert({
      where: { sessionId },
      create: { sessionId, suspended: true },
      update: { suspended: true, resumeOn: null },
    });
    await tx.emailDelivery.updateMany({
      where: { sessionId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'PAUSED', lockedUntil: null, lastError: null },
    });
    return;
  }
  const leavingArchive = previousStatus === 'ARCHIVED' && nextStatus !== 'ARCHIVED';
  if (leavingArchive && !reactivation)
    throw new ApiError(
      409,
      'Choisissez si les e-mails doivent rester suspendus ou être reprogrammés à la réactivation.',
    );
  if (!reactivation) return;
  if (reactivation.action === 'KEEP_PAUSED') {
    await tx.sessionEmailSchedule.upsert({
      where: { sessionId },
      create: { sessionId, suspended: true },
      update: { suspended: true, resumeOn: null },
    });
    await tx.emailDelivery.updateMany({
      where: { sessionId, status: 'PENDING' },
      data: { status: 'PAUSED', lockedUntil: null },
    });
    return;
  }
  if (reactivation.date < luxembourgDate(now))
    throw new ApiError(400, 'La date de reprise ne peut pas être dans le passé.');
  const resumeOn = new Date(reactivation.date + 'T00:00:00Z');
  await tx.sessionEmailSchedule.upsert({
    where: { sessionId },
    create: { sessionId, suspended: false, resumeOn },
    update: { suspended: false, resumeOn },
  });
  const paused = await tx.emailDelivery.findMany({
    where: { sessionId, status: { in: ['PAUSED', 'FAILED'] } },
    include: { participant: { select: { submittedAt: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const other = await tx.emailDelivery.findMany({
    where: { sessionId, status: { in: ['PENDING', 'SENDING', 'UNKNOWN', 'SENT'] } },
    select: { participantId: true, status: true, sentAt: true },
  });
  const restored = new Set<string>();
  const ids: string[] = [];
  // Reuse the original automatic delivery key; never duplicate a successful or uncertain send.
  paused.sort((a, b) => Number(Boolean(b.automaticKey)) - Number(Boolean(a.automaticKey)));
  for (const delivery of paused) {
    if (delivery.participant.submittedAt || restored.has(delivery.participantId)) continue;
    if (
      other.some(
        (d) =>
          d.participantId === delivery.participantId &&
          (d.status !== 'SENT' || (d.sentAt && d.sentAt >= delivery.createdAt)),
      )
    )
      continue;
    restored.add(delivery.participantId);
    ids.push(delivery.id);
  }
  await tx.emailDelivery.updateMany({
    where: { sessionId, status: { in: ['PAUSED', 'FAILED'] } },
    data: { status: 'CANCELLED', lockedUntil: null },
  });
  if (ids.length)
    await tx.emailDelivery.updateMany({
      where: { id: { in: ids } },
      data: { status: 'PENDING', notBefore: resumeOn, lastError: null },
    });
}
export async function emailOverview(sessionId: string) {
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: { emailSchedule: true },
  });
  if (!session) throw new ApiError(404, 'Session introuvable.');
  const policy = await getEmailPolicy();
  const schedule = session.emailSchedule as SavedEmailSchedule | null;
  const effective = effectiveEmailPolicy(policy, schedule);
  const counts = await db.emailDelivery.groupBy({
    by: ['status'],
    where: { sessionId },
    _count: true,
  });
  const recent = await db.emailDelivery.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      automaticKey: true,
      createdAt: true,
      sentAt: true,
      participant: { select: { firstName: true, lastName: true } },
    },
  });
  return {
    ...emailServiceStatus(),
    policy,
    schedule: schedule || { mode: 'INHERIT', delayDays: null },
    effective,
    dueDate: scheduledEmailDate(session.endDate || session.date, effective, schedule),
    suspended: Boolean(schedule?.suspended),
    active: session.status === 'ACTIVE',
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    recent,
    eligible: await db.participant.count({ where: { sessionId, submittedAt: null } }),
  };
}
export async function queueManualEmails(
  sessionId: string,
  participantId: string | undefined,
  actorId: string,
) {
  if (!emailServiceStatus().ready)
    throw new ApiError(
      503,
      'Configurez le service d’e-mail et une adresse publique HTTPS avant tout envoi.',
    );
  return db.$transaction(
    async (tx) => {
      const session = await lockSession(tx, sessionId);
      if (session.status !== 'ACTIVE')
        throw new ApiError(409, 'Activez la session avant d’envoyer les invitations.');
      if (
        participantId &&
        !(await tx.participant.findFirst({ where: { id: participantId, sessionId } }))
      )
        throw new ApiError(404, 'Participant introuvable dans cette session.');
      const candidates = await tx.participant.findMany({
        where: { sessionId, id: participantId, submittedAt: null },
        select: { id: true },
      });
      const blocked = await tx.emailDelivery.findMany({
        where: {
          sessionId,
          OR: [
            { status: { in: ['PENDING', 'SENDING', 'UNKNOWN'] } },
            { status: 'SENT', sentAt: { gt: new Date(Date.now() - 300_000) } },
          ],
        },
        select: { participantId: true },
      });
      const excluded = new Set(blocked.map((d) => d.participantId));
      const data = candidates
        .filter((p) => !excluded.has(p.id))
        .map((p) => ({ sessionId, participantId: p.id }));
      const queued = data.length ? (await tx.emailDelivery.createMany({ data })).count : 0;
      await tx.auditLog.create({
        data: {
          action: 'EMAIL_MANUAL_QUEUED',
          actorId,
          resourceId: sessionId,
          ipHash: 'admin-email',
        },
      });
      return { queued, skipped: candidates.length - queued };
    },
    { timeout: 15000 },
  );
}
export async function queueAutomaticEmails(now = new Date()) {
  if (!emailServiceStatus().ready) return 0;
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EmailSettings" WHERE id='email' FOR UPDATE`;
      const policy = await getEmailPolicy(tx);
      if (!policy.enabled) return 0;
      const candidates = await tx.$queryRaw<{ id: string; sessionId: string }[]>`
      SELECT p.id,p."sessionId" FROM "Participant" p
      JOIN "TrainingSession" s ON s.id=p."sessionId"
      LEFT JOIN "SessionEmailSchedule" e ON e."sessionId"=s.id
      WHERE s.status='ACTIVE' AND p."submittedAt" IS NULL AND COALESCE(e.mode,'INHERIT') <> 'OFF' AND NOT COALESCE(e.suspended,false)
        AND (e."resumeOn" IS NULL OR e."resumeOn" <= ${luxembourgDate(now)}::date)
        AND COALESCE(s."endDate",s.date) + (CASE WHEN e.mode='CUSTOM' THEN e."delayDays" ELSE ${policy.delayDays} END)::int <= ${luxembourgDate(now)}::date
        AND NOT EXISTS (SELECT 1 FROM "EmailDelivery" d WHERE d."automaticKey"=p.id OR (d."participantId"=p.id AND d.status IN ('PENDING','SENDING','UNKNOWN')))
      ORDER BY COALESCE(s."endDate",s.date),p.id LIMIT 100`;
      let queued = 0;
      for (const participant of candidates) {
        await lockSession(tx, participant.sessionId);
        const current = await tx.participant.findUnique({
          where: { id: participant.id },
          include: { session: { include: { emailSchedule: true } } },
        });
        if (!current || current.submittedAt || current.session.status !== 'ACTIVE') continue;
        const effective = effectiveEmailPolicy(
          policy,
          current.session.emailSchedule as SavedEmailSchedule | null,
        );
        if (
          !effective.enabled ||
          scheduledEmailDate(
            current.session.endDate || current.session.date,
            effective,
            current.session.emailSchedule as SavedEmailSchedule | null,
          ) > luxembourgDate(now)
        )
          continue;
        const result = await tx.emailDelivery.createMany({
          data: [
            {
              sessionId: participant.sessionId,
              participantId: participant.id,
              automaticKey: participant.id,
            },
          ],
          skipDuplicates: true,
        });
        queued += result.count;
      }
      return queued;
    },
    { timeout: 30000 },
  );
}
export async function deliverEmails(
  sessionId?: string,
  transport: (message: OutgoingEmail) => Promise<void> = sendSmtpEmail,
  now = new Date(),
) {
  if (!emailServiceStatus().ready) return { sent: 0, uncertain: 0 };
  await db.emailDelivery.updateMany({
    where: {
      status: 'PENDING',
      participant: { submittedAt: null },
      session: { status: 'ARCHIVED' },
    },
    data: { status: 'PAUSED', lockedUntil: null },
  });
  await db.emailDelivery.updateMany({
    where: { status: 'SENDING', lockedUntil: { lt: now } },
    data: {
      status: 'UNKNOWN',
      lockedUntil: null,
      lastError:
        'Confirmation d’envoi absente. Vérifier dans le service d’e-mail avant toute nouvelle tentative.',
    },
  });
  await db.emailDelivery.updateMany({
    where: {
      status: 'PENDING',
      OR: [{ participant: { submittedAt: { not: null } } }, { session: { status: 'DRAFT' } }],
    },
    data: { status: 'CANCELLED' },
  });
  const policy = await getEmailPolicy();
  const candidates = await db.$queryRaw<{ id: string; sessionId: string }[]>`
    SELECT d.id,d."sessionId" FROM "EmailDelivery" d
    JOIN "TrainingSession" s ON s.id=d."sessionId"
    LEFT JOIN "SessionEmailSchedule" e ON e."sessionId"=s.id
    WHERE d.status='PENDING' AND (${sessionId || null}::text IS NULL OR d."sessionId"=${sessionId || null})
      AND s.status='ACTIVE' AND (d."notBefore" IS NULL OR d."notBefore" <= ${luxembourgDate(now)}::date)
      AND (d."automaticKey" IS NULL OR (${policy.enabled} AND NOT COALESCE(e.suspended,false) AND COALESCE(e.mode,'INHERIT')<>'OFF' AND (e."resumeOn" IS NULL OR e."resumeOn"<=${luxembourgDate(now)}::date) AND COALESCE(s."endDate",s.date)+(CASE WHEN e.mode='CUSTOM' THEN e."delayDays" ELSE ${policy.delayDays} END)::int <= ${luxembourgDate(now)}::date))
    ORDER BY d."createdAt",d.id LIMIT 100`;
  let sent = 0,
    uncertain = 0;
  const deadline = Date.now() + 180000;
  for (const delivery of candidates) {
    if (Date.now() >= deadline) break;
    const claimed = await db.$transaction(async (tx) => {
      await lockSession(tx, delivery.sessionId);
      const current = await tx.emailDelivery.findUnique({
        where: { id: delivery.id },
        include: { participant: true, session: { include: { emailSchedule: true } } },
      });
      if (!current || current.status !== 'PENDING') return null;
      if (current.participant.submittedAt || current.session.status !== 'ACTIVE') {
        await tx.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status:
              current.participant.submittedAt || current.session.status !== 'ARCHIVED'
                ? 'CANCELLED'
                : 'PAUSED',
          },
        });
        return null;
      }
      if (current.notBefore && current.notBefore.toISOString().slice(0, 10) > luxembourgDate(now))
        return null;
      if (current.automaticKey) {
        const policy = effectiveEmailPolicy(
          await getEmailPolicy(tx),
          current.session.emailSchedule as SavedEmailSchedule | null,
        );
        if (
          !policy.enabled ||
          scheduledEmailDate(
            current.session.endDate || current.session.date,
            policy,
            current.session.emailSchedule as SavedEmailSchedule | null,
          ) > luxembourgDate(now)
        )
          return null;
      }
      const url = `${baseUrl()}/form/${encodeURIComponent(current.sessionId)}/${decryptToken(current.participant.tokenEncrypted)}`;
      const message = invitationEmail({
        firstName: current.participant.firstName,
        sessionName: current.session.name,
        date: current.session.date,
        endDate: current.session.endDate,
        trainer: current.session.trainer,
        sessionId: current.sessionId,
        url,
      });
      await tx.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENDING', lockedUntil: new Date(Date.now() + 120000) },
      });
      return {
        deliveryId: delivery.id,
        sessionRevision: current.session.integrationRevision,
        eventType: 'satisfaction.email',
        sessionId: current.sessionId,
        participantId: current.participantId,
        to: current.participant.email,
        firstName: current.participant.firstName,
        lastName: current.participant.lastName,
        sessionName: current.session.name,
        sessionDate: current.session.date.toISOString().slice(0, 10),
        formUrl: url,
        ...message,
      };
    });
    if (!claimed) continue;
    // A suspended worker must not resume a stale claim after cleanup or expiry.
    const live = await db.emailDelivery.findFirst({
      where: {
        id: delivery.id,
        status: 'SENDING',
        lockedUntil: { gt: new Date() },
        participant: { submittedAt: null },
        session: { status: 'ACTIVE', integrationRevision: claimed.sessionRevision },
      },
    });
    if (!live) {
      await db.$transaction(async (tx) => {
        const session = await lockSession(tx, delivery.sessionId);
        const current = await tx.emailDelivery.findUnique({
          where: { id: delivery.id },
          include: { participant: { select: { submittedAt: true } } },
        });
        if (!current || current.status !== 'SENDING') return;
        const schedule = await tx.sessionEmailSchedule.findUnique({
          where: { sessionId: delivery.sessionId },
        });
        await tx.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: current.participant.submittedAt
              ? 'CANCELLED'
              : session.status === 'ACTIVE' && !schedule?.suspended
                ? 'PENDING'
                : 'PAUSED',
            lockedUntil: null,
            notBefore: schedule?.resumeOn || current.notBefore,
          },
        });
      });
      continue;
    }
    try {
      await transport(claimed);
      await db.emailDelivery.updateMany({
        where: { id: delivery.id, status: 'SENDING' },
        data: { status: 'SENT', sentAt: new Date(), lockedUntil: null, lastError: null },
      });
      sent++;
    } catch (error) {
      const beforeSend = error instanceof EmailSendError && !error.uncertain;
      await db.emailDelivery.updateMany({
        where: { id: delivery.id, status: 'SENDING' },
        data: {
          status: beforeSend ? 'FAILED' : 'UNKNOWN',
          lockedUntil: null,
          lastError: beforeSend
            ? 'Échec SMTP avant envoi. Vérifiez la configuration Mailgun puis relancez manuellement.'
            : 'Envoi non confirmé. Vérifiez les journaux Mailgun ; aucune relance automatique pour éviter un doublon.',
        },
      });
      uncertain++;
    }
  }
  return { sent, uncertain };
}
