import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
test(
  'E-mails : PostgreSQL réel, planification, ciblage, concurrence et suivi sans SMTP réel',
  { timeout: 120000 },
  async (t) => {
    const root = resolve('.test-postgres'),
      directory = resolve(root, randomUUID());
    assert.ok(directory.startsWith(root + sep));
    const password = randomBytes(20).toString('hex');
    const pg = new EmbeddedPostgres({
      databaseDir: directory,
      user: 'postgres',
      password,
      port: 55443,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      postgresFlags: ['-c', 'io_method=sync'],
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    let started = false;
    try {
      await pg.initialise();
      await pg.start();
      started = true;
      process.env.DATABASE_URL = `postgresql://postgres:${password}@localhost:55443/postgres?connection_limit=12`;
      process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
      process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex');
      process.env.NEXTAUTH_URL = 'https://survey.example.org';
      Object.assign(process.env, {
        SMTP_HOST: 'smtp.eu.mailgun.org',
        SMTP_PORT: '587',
        SMTP_USER: 'postmaster@example.org',
        SMTP_PASSWORD: 'test-only-not-real',
        EMAIL_FROM: 'survey@example.org',
      });
      const client = pg.getPgClient('postgres', 'localhost');
      await client.connect();
      try {
        for (const name of readdirSync(resolve('prisma/migrations'))
          .filter((n) => /^\d/.test(n))
          .sort()) {
          if (name === '202610220005_session_end_date')
            await client.query(
              `INSERT INTO "TrainingSession" (id,name,date,trainer,"updatedAt") VALUES ('LEGACY-DATE','Formation existante','2026-10-01','Test',NOW())`,
            );
          await client.query(
            readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8'),
          );
        }
        const legacy = await client.query(
          `SELECT "endDate" = date AS preserved, "formLanguage" FROM "TrainingSession" WHERE id='LEGACY-DATE'`,
        );
        assert.equal(legacy.rows[0].preserved, true);
        assert.equal(legacy.rows[0].formLanguage, 'fr');
      } finally {
        await client.end();
      }
      const { db } = await import('../../src/lib/db');
      const { runAutomations, automationOverview } = await import('../../src/lib/automations');
      const { listParticipants, emailHistoryItem, emailHistorySelect } =
        await import('../../src/lib/participants');
      const {
        queueAutomaticEmails,
        queueManualEmails,
        deliverEmails,
        saveEmailSchedule,
        emailOverview,
        applySessionEmailTransition,
      } = await import('../../src/lib/emails');
      const { EmailSendError } = await import('../../src/lib/email-smtp');
      const { generateToken, encryptToken, hashToken } = await import('../../src/lib/crypto');
      const { deleteArchivedSession } = await import('../../src/lib/retention');
      const { lockSession } = await import('../../src/lib/sessions');
      const { luxembourgDate, emailDueDate } = await import('../../src/lib/email-policy');
      try {
        await t.test(
          'suivi : exécutions persistées, erreurs isolées, concurrence et interruption sans envoi réel',
          async () => {
            let calls = 0;
            const tasks = {
              retention: async () => ({ enabled: false, deleted: 0, skipped: 0 }),
              queue: async () => 0,
              webhooks: async () => {
                calls++;
              },
              odoo: async () => {
                calls++;
              },
              emails: async () => ({ sent: 0, uncertain: 0 }),
              cleanup: async () => {},
            };
            const first = await runAutomations(tasks);
            assert.equal(first.status, 'SUCCEEDED');
            assert.equal(calls, 2);
            const failed = await runAutomations({
              ...tasks,
              retention: async () => {
                throw new Error('never-store-secret-or-email');
              },
            });
            assert.equal(failed.status, 'PARTIAL');
            assert.equal(calls, 4);
            const latest = await db.automationRun.findUniqueOrThrow({
              where: { id: failed.runId },
            });
            assert.equal(JSON.stringify(latest).includes('never-store-secret'), false);
            let release!: () => void;
            let entered!: () => void;
            const gate = new Promise<void>((resolve) => {
              release = resolve;
            });
            const start = new Promise<void>((resolve) => {
              entered = resolve;
            });
            const running = runAutomations({
              ...tasks,
              retention: async () => {
                entered();
                await gate;
                return { enabled: false, deleted: 0, skipped: 0 };
              },
            });
            await start;
            const overlapping = await runAutomations(tasks);
            assert.equal(overlapping.skipped, true);
            release();
            await running;
            const stale = await db.automationRun.create({
              data: { startedAt: new Date(Date.now() - 9 * 60000) },
            });
            await runAutomations(tasks);
            assert.equal(
              (await db.automationRun.findUniqueOrThrow({ where: { id: stale.id } })).status,
              'TIMED_OUT',
            );
            const overview = await automationOverview();
            assert.ok(overview.runs.length >= 5);
            assert.equal('CRON_SECRET' in overview, false);
          },
        );
        const session = await db.trainingSession.create({
          data: {
            id: 'EMAIL-001',
            name: 'Formation test e-mail',
            trainer: 'Test',
            date: new Date('2020-01-01'),
            status: 'ACTIVE',
          },
        });
        const people: { id: string }[] = [];
        for (let i = 0; i < 4; i++) {
          const token = generateToken();
          people.push(
            await db.participant.create({
              data: {
                sessionId: session.id,
                firstName: `Test${i}`,
                lastName: 'Participant',
                email: `person${i}@example.org`,
                tokenHash: hashToken(token),
                tokenEncrypted: encryptToken(token),
                submittedAt: i === 3 ? new Date() : null,
              },
            }),
          );
        }
        await t.test(
          'désactivé par défaut ; activation et envoi automatique unique uniquement aux non-répondants',
          async () => {
            assert.equal(await queueAutomaticEmails(), 0);
            await db.emailSettings.create({ data: { id: 'email', enabled: true, delayDays: 1 } });
            const results = await Promise.all([queueAutomaticEmails(), queueAutomaticEmails()]);
            assert.equal(
              results.reduce((a, b) => a + b, 0),
              3,
            );
            assert.equal(await db.emailDelivery.count(), 3);
            assert.equal(await queueAutomaticEmails(), 0);
          },
        );
        await t.test(
          'un participant qui répond avant le traitement ne reçoit rien ; deux workers ne doublonnent pas',
          async () => {
            await db.participant.update({
              where: { id: people[2].id },
              data: { submittedAt: new Date() },
            });
            const sent: string[] = [];
            const send = async (mail: { deliveryId: string; to: string; html: string }) => {
              assert.ok(mail.html.includes('/form/EMAIL-001/'));
              sent.push(mail.deliveryId);
            };
            await Promise.all([deliverEmails(undefined, send), deliverEmails(undefined, send)]);
            assert.equal(sent.length, 2);
            assert.equal(new Set(sent).size, 2);
            assert.equal(await db.emailDelivery.count({ where: { status: 'CANCELLED' } }), 1);
          },
        );
        await t.test(
          'calendrier personnalisé, désactivation de session et activation générale',
          async () => {
            await db.$transaction((tx) =>
              saveEmailSchedule(tx, session.id, { mode: 'CUSTOM', delayDays: 365 }),
            );
            const recent = await db.trainingSession.create({
              data: {
                id: 'EMAIL-NEW',
                name: 'Nouvelle session',
                trainer: 'Test',
                date: new Date(),
                status: 'ACTIVE',
              },
            });
            const token = generateToken();
            await db.participant.create({
              data: {
                sessionId: recent.id,
                firstName: 'Jean',
                lastName: 'Test',
                email: 'recent@example.org',
                tokenHash: hashToken(token),
                tokenEncrypted: encryptToken(token),
              },
            });
            assert.equal(await queueAutomaticEmails(), 0);
            await db.trainingSession.update({
              where: { id: recent.id },
              data: { date: new Date('2020-01-01') },
            });
            await db.$transaction((tx) => saveEmailSchedule(tx, recent.id, { mode: 'OFF' }));
            assert.equal(await queueAutomaticEmails(), 0);
          },
        );
        await t.test(
          'envoi manuel ciblé, réponses exclues, délai anti-double-clic et incertitude sans renvoi',
          async () => {
            const initial = await queueManualEmails(session.id, people[0].id, 'admin-test');
            assert.equal(initial.queued, 0);
            await db.emailDelivery.updateMany({
              where: { status: 'SENT' },
              data: { sentAt: new Date(Date.now() - 600000) },
            });
            const results = await Promise.all([
              queueManualEmails(session.id, people[0].id, 'admin-test'),
              queueManualEmails(session.id, people[0].id, 'admin-test'),
            ]);
            assert.equal(
              results.reduce((sum, r) => sum + r.queued, 0),
              1,
            );
            await deliverEmails(session.id, async () => {
              throw new Error('SMTP acknowledgement lost');
            });
            assert.equal(await db.emailDelivery.count({ where: { status: 'UNKNOWN' } }), 1);
            assert.equal(
              (await queueManualEmails(session.id, people[0].id, 'admin-test')).queued,
              0,
            );
            assert.equal(
              (await queueManualEmails(session.id, people[3].id, 'admin-test')).queued,
              0,
            );
            assert.equal((await queueManualEmails(session.id, undefined, 'admin-test')).queued, 1);
            await deliverEmails(session.id, async () => {
              throw new EmailSendError(false);
            });
            assert.equal(await db.emailDelivery.count({ where: { status: 'FAILED' } }), 1);
            assert.equal(
              (await queueManualEmails(session.id, people[1].id, 'admin-test')).queued,
              1,
            );
          },
        );
        await t.test(
          'le suivi conserve les envois confirmés lorsqu’un rappel est en attente, sans exposer de token',
          async () => {
            const page = await listParticipants(session.id, 1);
            assert.equal(page.total, 4);
            const target = page.items.find((p) => p.id === people[1].id)!;
            assert.equal(target.emailSummary.sentCount, 1);
            assert.ok(target.emailSummary.lastSentAt);
            assert.equal(target.emailSummary.latest?.status, 'PENDING');
            assert.equal(target.emailSummary.latest?.kind, 'MANUAL');
            const uncertain = page.items.find((p) => p.id === people[0].id)!;
            assert.equal(uncertain.emailSummary.sentCount, 1);
            assert.equal(uncertain.emailSummary.latest?.status, 'UNKNOWN');
            const uncontacted = page.items.find((p) => p.id === people[3].id)!;
            assert.deepEqual(uncontacted.emailSummary, {
              sentCount: 0,
              lastSentAt: null,
              latest: null,
            });
            const history = (
              await db.emailDelivery.findMany({
                where: { participantId: people[1].id },
                select: emailHistorySelect,
              })
            ).map(emailHistoryItem);
            assert.equal(history.length, 3);
            for (const key of ['tokenEncrypted', 'tokenHash', 'automaticKey', 'SMTP_PASSWORD']) {
              assert.equal(JSON.stringify({ page, history }).includes(key), false);
            }
            assert.deepEqual((await listParticipants(session.id, 2)).items, []);
            assert.equal((await listParticipants('EMAIL-NEW', 1)).total, 1);
            assert.equal((await listParticipants('missing-session', 1)).total, 0);
          },
        );
        await t.test(
          'formation sur plusieurs jours : fin, prolongation et délai personnalisé contrôlés avant envoi',
          async () => {
            const target = await db.trainingSession.create({
              data: {
                id: 'EMAIL-MULTI',
                name: 'Formation de plusieurs jours',
                trainer: 'Test',
                date: new Date('2026-12-07'),
                endDate: new Date('2026-12-10'),
                status: 'ACTIVE',
              },
            });
            const token = generateToken();
            await db.participant.create({
              data: {
                sessionId: target.id,
                firstName: 'Multi',
                lastName: 'Test',
                email: 'multi@example.org',
                tokenHash: hashToken(token),
                tokenEncrypted: encryptToken(token),
              },
            });
            assert.equal((await emailOverview(target.id)).dueDate, '2026-12-11');
            assert.equal(await queueAutomaticEmails(new Date('2026-12-08T12:00:00Z')), 0);
            assert.equal(await queueAutomaticEmails(new Date('2026-12-10T22:30:00Z')), 0);
            assert.equal(await queueAutomaticEmails(new Date('2026-12-10T23:00:00Z')), 1);
            await assert.rejects(
              db.trainingSession.update({
                where: { id: target.id },
                data: { endDate: new Date('2026-12-06') },
              }),
            );
            await db.trainingSession.update({
              where: { id: target.id },
              data: { endDate: new Date('2026-12-17'), integrationRevision: { increment: 1 } },
            });
            let sends = 0;
            const send = async (mail: { html: string }) => {
              sends++;
              assert.ok(mail.html.includes('7 décembre 2026 – 17 décembre 2026'));
            };
            await deliverEmails(target.id, send, new Date('2026-12-11T12:00:00Z'));
            assert.equal(sends, 0);
            assert.equal((await emailOverview(target.id)).dueDate, '2026-12-18');
            await db.$transaction((tx) =>
              saveEmailSchedule(tx, target.id, { mode: 'CUSTOM', delayDays: 7 }),
            );
            assert.equal((await emailOverview(target.id)).dueDate, '2026-12-24');
            await deliverEmails(target.id, send, new Date('2026-12-23T22:30:00Z'));
            assert.equal(sends, 0);
            await deliverEmails(target.id, send, new Date('2026-12-23T23:00:00Z'));
            assert.equal(sends, 1);
            await deliverEmails(target.id, send, new Date('2026-12-25T12:00:00Z'));
            assert.equal(sends, 1);
          },
        );
        await t.test(
          'archivage immédiat sans SMTP, réactivation sans reprise puis reprogrammation datée et aucun doublon',
          async () => {
            const target = await db.trainingSession.create({
              data: {
                id: 'EMAIL-ARCHIVE',
                name: 'Archivage sans envoi',
                trainer: 'Test',
                date: new Date('2020-01-01'),
                status: 'ACTIVE',
              },
            });
            const targets: { id: string }[] = [];
            for (let i = 0; i < 5; i++) {
              const token = generateToken();
              const p = await db.participant.create({
                data: {
                  sessionId: target.id,
                  firstName: `Archive${i}`,
                  lastName: 'Test',
                  email: `archive${i}@example.org`,
                  tokenHash: hashToken(token),
                  tokenEncrypted: encryptToken(token),
                },
              });
              targets.push(p);
              await db.emailDelivery.create({
                data: {
                  sessionId: target.id,
                  participantId: p.id,
                  ...(i !== 4 && { automaticKey: p.id }),
                  status: i === 2 ? 'SENT' : i === 3 ? 'UNKNOWN' : i === 1 ? 'FAILED' : 'PENDING',
                  sentAt: i === 2 ? new Date() : null,
                },
              });
            }
            // The manual reminder follows an earlier automatic invitation.
            await db.emailDelivery.create({
              data: {
                sessionId: target.id,
                participantId: targets[4].id,
                automaticKey: targets[4].id,
                status: 'SENT',
                sentAt: new Date(Date.now() - 600000),
                createdAt: new Date(Date.now() - 600000),
              },
            });
            const transition = async (
              status: 'ACTIVE' | 'ARCHIVED',
              choice?: import('../../src/lib/email-policy').EmailReactivation,
            ) =>
              db.$transaction(async (tx) => {
                const current = await lockSession(tx, target.id);
                await applySessionEmailTransition(tx, target.id, current.status, status, choice);
                await tx.trainingSession.update({
                  where: { id: target.id },
                  data: { status, integrationRevision: { increment: 1 } },
                });
              });
            const password = process.env.SMTP_PASSWORD;
            delete process.env.SMTP_PASSWORD;
            try {
              await transition('ARCHIVED');
            } finally {
              process.env.SMTP_PASSWORD = password;
            }
            assert.equal(
              await db.emailDelivery.count({ where: { sessionId: target.id, status: 'PAUSED' } }),
              3,
            );
            assert.equal(
              (await db.sessionEmailSchedule.findUniqueOrThrow({ where: { sessionId: target.id } }))
                .suspended,
              true,
            );
            await assert.rejects(transition('ACTIVE'), /Choisissez/);
            assert.equal(
              (await db.trainingSession.findUniqueOrThrow({ where: { id: target.id } })).status,
              'ARCHIVED',
            );
            await transition('ACTIVE', { action: 'KEEP_PAUSED' });
            let sends = 0;
            const send = async () => {
              sends++;
            };
            await deliverEmails(target.id, send);
            assert.equal(sends, 0);
            const freshToken = generateToken();
            const fresh = await db.participant.create({
              data: {
                sessionId: target.id,
                firstName: 'Ajout',
                lastName: 'Tardif',
                email: 'late@example.org',
                tokenHash: hashToken(freshToken),
                tokenEncrypted: encryptToken(freshToken),
              },
            });
            await queueAutomaticEmails();
            assert.equal(await db.emailDelivery.count({ where: { participantId: fresh.id } }), 0);
            const future = emailDueDate(new Date(luxembourgDate(new Date())), 7);
            await assert.rejects(
              transition('ACTIVE', { action: 'RESCHEDULE', date: '2000-01-01' }),
              /passé/,
            );
            await transition('ACTIVE', { action: 'RESCHEDULE', date: future });
            assert.equal(
              await db.emailDelivery.count({
                where: { sessionId: target.id, status: 'PENDING', notBefore: new Date(future) },
              }),
              3,
            );
            await deliverEmails(target.id, send);
            assert.equal(sends, 0);
            await db.participant.update({
              where: { id: targets[0].id },
              data: { submittedAt: new Date() },
            });
            const due = new Date(future + 'T12:00:00Z');
            await queueAutomaticEmails(due);
            await deliverEmails(target.id, send, due);
            assert.equal(sends, 3); // Two restored, one newly eligible; the respondent is excluded.
            assert.equal(
              await db.emailDelivery.count({ where: { sessionId: target.id, status: 'UNKNOWN' } }),
              1,
            );
            assert.equal(
              await db.emailDelivery.count({ where: { participantId: targets[2].id } }),
              1,
            );
            await queueAutomaticEmails(due);
            await deliverEmails(target.id, send, due);
            assert.equal(sends, 3);
          },
        );
        await t.test(
          'archivage annule les messages ; suppression respecte un envoi en cours puis efface les traces locales',
          async () => {
            const pending = await db.emailDelivery.findFirstOrThrow({
              where: { status: 'PENDING', sessionId: session.id },
            });
            await db.emailDelivery.update({
              where: { id: pending.id },
              data: { status: 'SENDING', lockedUntil: new Date(Date.now() + 120000) },
            });
            await db.trainingSession.update({
              where: { id: session.id },
              data: { status: 'ARCHIVED', archivedAt: new Date() },
            });
            assert.equal(
              await db.$transaction((tx) =>
                deleteArchivedSession(tx, session.id, { ipHash: 'test' }),
              ),
              'busy',
            );
            await db.emailDelivery.update({
              where: { id: pending.id },
              data: { status: 'PENDING', lockedUntil: null },
            });
            let sent = 0;
            await deliverEmails(session.id, async () => {
              sent++;
            });
            assert.equal(sent, 0);
            assert.equal(
              await db.$transaction((tx) =>
                deleteArchivedSession(tx, session.id, { ipHash: 'test' }),
              ),
              'deleted',
            );
            assert.equal(await db.emailDelivery.count({ where: { sessionId: session.id } }), 0);
            assert.equal(
              await db.sessionEmailSchedule.count({ where: { sessionId: session.id } }),
              0,
            );
          },
        );
      } finally {
        await db.$disconnect();
      }
    } finally {
      if (started) await pg.stop();
    }
  },
);
