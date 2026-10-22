import { db } from './db';
import { type AutomationStep, cronTimes } from './automation-policy';
import { purgeArchivedSessions } from './retention';
import { queueAutomaticEmails, deliverEmails, emailServiceStatus, getEmailPolicy } from './emails';
import { deliverWebhooks, powerAutomateConfigured } from './webhooks';
import { deliverOdoo, powerAutomateOnly, ODOO_PREFIX } from './odoo';
import type { Prisma } from '@prisma/client';
export type AutomationTasks = {
  retention: () => Promise<{ enabled: boolean; deleted: number; skipped: number }>;
  queue: () => Promise<number>;
  webhooks: () => Promise<unknown>;
  odoo: () => Promise<unknown>;
  emails: () => Promise<{ sent: number; uncertain: number }>;
  cleanup: () => Promise<unknown>;
};
function productionTasks(): AutomationTasks {
  const deadline = Date.now() + 250000;
  const budget = { limit: 2000, deadline };
  return {
    retention: purgeArchivedSessions,
    queue: async () => {
      let queued = 0;
      // Each batch has its own short transaction. Never hold one transaction for the whole queue.
      const queueDeadline = Math.min(deadline - 60000, Date.now() + 60000);
      for (let i = 0; i < 20 && Date.now() < queueDeadline; i++) {
        const n = await queueAutomaticEmails();
        queued += n;
        if (n < 100) break;
      }
      return queued;
    },
    webhooks: () => deliverWebhooks(undefined, budget),
    odoo: () => deliverOdoo(undefined, undefined, budget),
    emails: () => deliverEmails(undefined, undefined, new Date(), budget),
    cleanup: () => db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  };
}
export async function runAutomations(work: AutomationTasks = productionTasks(), now = new Date()) {
  const cutoff = new Date(now.getTime() - 8 * 60000);
  const claimed = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724290116::bigint)`;
    await tx.automationRun.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: cutoff } },
      data: { status: 'TIMED_OUT', finishedAt: now },
    });
    if (await tx.automationRun.findFirst({ where: { status: 'RUNNING' } })) return null;
    return tx.automationRun.create({ data: { startedAt: now } });
  });
  if (!claimed) return { ok: true, skipped: true, status: 'RUNNING' };
  const steps: AutomationStep[] = [];
  let writes = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.parse(JSON.stringify(steps)) as Prisma.InputJsonValue;
    writes = writes.then(async () => {
      await db.automationRun.update({ where: { id: claimed.id }, data: { steps: snapshot } });
    });
    return writes;
  };
  async function stage<T>(name: string, fn: () => Promise<T>, summary: (result: T) => string) {
    const step: AutomationStep = { name, status: 'RUNNING', summary: 'Traitement en cours.' };
    steps.push(step);
    await persist();
    try {
      const result = await fn();
      step.status = 'SUCCEEDED';
      step.summary = summary(result);
      await persist();
      return result;
    } catch (error) {
      step.status = 'FAILED';
      step.summary = 'Traitement interrompu. Vérifiez la configuration et les journaux du serveur.';
      console.error(
        'automation_step_error',
        name,
        error instanceof Error ? error.name : 'UnknownError',
      );
      await persist();
      return undefined;
    }
  }
  const retention = await stage('Conservation des sessions', work.retention, (r) =>
    r.enabled
      ? `${r.deleted} session(s) supprimée(s), ${r.skipped} reportée(s).`
      : 'Suppression automatique désactivée.',
  );
  const queuedEmails = await stage(
    'Planification des invitations',
    work.queue,
    (n) => `${n} invitation(s) mise(s) en attente.`,
  );
  const [, , emails] = await Promise.all([
    stage(
      'Power Automate',
      work.webhooks,
      () => 'Traitement terminé. Consulter les compteurs de livraison ci-dessous.',
    ),
    stage(
      'Odoo',
      work.odoo,
      () => 'Traitement terminé. Consulter les compteurs de livraison ci-dessous.',
    ),
    stage(
      'Envoi des e-mails',
      work.emails,
      (r) => `${r.sent} envoyé(s), ${r.uncertain} à vérifier.`,
    ),
    stage('Nettoyage technique', work.cleanup, () => 'Traitement terminé.'),
  ]);
  const failures = steps.filter((s) => s.status === 'FAILED').length;
  const status = failures === steps.length ? 'FAILED' : failures ? 'PARTIAL' : 'SUCCEEDED';
  await db.automationRun.update({
    where: { id: claimed.id },
    data: { status, finishedAt: new Date(), steps: steps as unknown as Prisma.InputJsonValue },
  });
  return { ok: !failures, runId: claimed.id, status, retention, queuedEmails, emails };
}
export async function automationOverview(now = new Date()) {
  const countOdoo = (states: string[]) =>
    db.webhookDelivery.count({
      where: {
        id: { startsWith: ODOO_PREFIX },
        OR: states.map((state) => ({ payload: { path: ['state'], equals: state } })),
      },
    });
  const [runs, emailGroups, policy, odooPending, odooFailed, odooUncertain, paPending, paFailed] =
    await Promise.all([
      db.automationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
      db.emailDelivery.groupBy({ by: ['status'], _count: true }),
      getEmailPolicy(),
      countOdoo(['PENDING', 'VERIFYING']),
      countOdoo(['FAILED']),
      countOdoo(['UNKNOWN', 'POSTING']),
      db.webhookDelivery.count({ where: { ...powerAutomateOnly, deliveredAt: null } }),
      db.webhookDelivery.count({
        where: { ...powerAutomateOnly, deliveredAt: null, lastError: { not: null } },
      }),
    ]);
  const timing = cronTimes(now);
  const last = runs[0];
  return {
    runs: runs.map((r) => ({
      ...r,
      status:
        r.status === 'RUNNING' && now.getTime() - r.startedAt.getTime() > 8 * 60000
          ? 'TIMED_OUT'
          : r.status,
    })),
    nextScheduledAt: timing.next,
    expectedScheduledAt: timing.expected,
    overdue: !!last && timing.gracePassed && last.startedAt.toISOString() < timing.expected,
    scheduler: { vercel: !!process.env.VERCEL, configured: !!process.env.CRON_SECRET },
    emails: {
      ...emailServiceStatus(),
      automaticEnabled: policy.enabled,
      counts: Object.fromEntries(emailGroups.map((g) => [g.status, g._count])),
    },
    odoo: { pending: odooPending, failed: odooFailed, uncertain: odooUncertain },
    powerAutomate: { configured: powerAutomateConfigured(), pending: paPending, failed: paFailed },
  };
}
