import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { legacyDefaultQuestions, defaultQuestions } from '../../src/lib/validation';
import { odooFixture, testOdooUrl } from '../fixtures/odoo';
test(
  'PostgreSQL réel : transaction, usage unique, concurrence, refus et outbox',
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
      port: 55439,
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
      process.env.DATABASE_URL = `postgresql://postgres:${password}@localhost:55439/postgres?connection_limit=12`;
      process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
      process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex');
      const client = pg.getPgClient('postgres', 'localhost');
      await client.connect();
      try {
        for (const migration of readdirSync(resolve('prisma/migrations'))
          .filter((n) => /^\d/.test(n))
          .sort()) {
          await client.query(
            readFileSync(resolve('prisma/migrations', migration, 'migration.sql'), 'utf8'),
          );
        }
      } finally {
        await client.end();
      }
      const { db } = await import('../../src/lib/db');
      const { submitResponse } = await import('../../src/lib/submission');
      const { generateToken, hashToken, encryptToken, decryptToken } =
        await import('../../src/lib/crypto');
      const { rateLimit, ApiError } = await import('../../src/lib/security');
      const { statistics } = await import('../../src/lib/reports');
      const { deliverWebhooks } = await import('../../src/lib/webhooks');
      const session = await db.trainingSession.create({
        data: {
          id: 'TEST-2026-001',
          name: 'Session de test',
          trainer: 'Formateur Test',
          date: new Date('2026-12-11'),
          status: 'ACTIVE',
          questions: {
            create: [
              { label: 'Votre satisfaction', type: 'RATING_4', required: true, position: 0 },
            ],
          },
        },
        include: { questions: true },
      });
      const token = generateToken(),
        participant = await db.participant.create({
          data: {
            sessionId: session.id,
            firstName: 'Jean',
            lastName: 'Test',
            email: 'jean@example.com',
            tokenHash: hashToken(token),
            tokenEncrypted: encryptToken(token),
          },
        });
      const input = {
        sessionId: session.id,
        language: 'en' as const,
        token,
        answers: [
          { questionId: session.questions[0].id, value: 4, comment: 'Très bonne formation.' },
        ],
      };
      try {
        await t.test('les réponses invalides ne consomment pas le lien', async () => {
          await assert.rejects(
            submitResponse(
              { ...input, answers: [{ questionId: session.questions[0].id, value: 5 }] },
              'ip-test',
            ),
            (e: unknown) => e instanceof ApiError && e.status === 400,
          );
          assert.equal(
            (await db.participant.findUniqueOrThrow({ where: { id: participant.id } })).submittedAt,
            null,
          );
          assert.equal(await db.response.count(), 0);
          assert.equal(await db.webhookDelivery.count(), 0);
        });
        await t.test('un mauvais token ne révèle pas le participant', async () => {
          await assert.rejects(
            submitResponse({ ...input, token: generateToken() }, 'ip-test'),
            (e: unknown) => e instanceof ApiError && e.status === 404,
          );
        });
        await t.test('une seule soumission parmi 8 envois concurrents', async () => {
          const results = await Promise.allSettled(
            Array.from({ length: 8 }, () => submitResponse(input, 'ip-test')),
          );
          assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
          assert.equal(
            results.filter(
              (r) =>
                r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 409,
            ).length,
            7,
          );
          assert.equal(await db.response.count(), 1);
          assert.equal((await db.response.findFirstOrThrow()).language, 'en');
          assert.equal(await db.webhookDelivery.count(), 1);
          assert.ok(
            (await db.participant.findUniqueOrThrow({ where: { id: participant.id } })).submittedAt,
          );
        });
        await t.test(
          'les retours ultérieurs restent refusés et l’événement est complet',
          async () => {
            await assert.rejects(
              submitResponse(input, 'ip-test'),
              (e: unknown) => e instanceof ApiError && e.status === 409,
            );
            const event = await db.webhookDelivery.findFirstOrThrow();
            const payload = event.payload as Record<string, unknown>;
            assert.equal(payload.eventId, event.id);
            assert.equal(payload.email, 'jean@example.com');
            assert.equal(payload.sessionId, session.id);
            assert.ok(payload.submittedAt);
            assert.equal(payload.schemaVersion, 2);
            assert.equal(payload.sessionName, 'Session de test');
            assert.equal(payload.sessionDate, '2026-12-11');
            assert.equal(payload.participantScore, 4);
            assert.equal(payload.participantScorePercent, 100);
            assert.equal(payload.sessionAverageScore, 4);
            assert.equal(payload.sessionSatisfactionPercent, 100);
            assert.equal(payload.sessionParticipationPercent, 100);
            assert.equal(payload.sessionVersion, 1);
            assert.ok(!JSON.stringify(payload).includes(token));
            assert.ok(!JSON.stringify(payload).includes('tokenEncrypted'));
          },
        );
        await t.test('les statistiques reflètent les vraies données', async () => {
          const stats = await statistics();
          assert.equal(stats.responses, 1);
          assert.equal(stats.participants, 1);
          assert.equal(stats.responseRate, 100);
          assert.equal(stats.satisfaction, 4);
          assert.equal(stats.results[0].distribution['4'], 1);
          assert.deepEqual(stats.results[0].comments, ['Très bonne formation.']);
        });
        await t.test(
          'rapports bornés : pagination, résumés, notes normalisées et recherche hors première page',
          async () => {
            const training = await db.trainingSession.create({
              data: {
                id: 'AUDIT-VOLUME',
                name: 'Test de volume isolé',
                date: new Date('2026-10-22'),
                trainer: 'Test',
                questions: {
                  create: Array.from({ length: 61 }, (_, i) => ({
                    position: i,
                    label: `Question ${i}`,
                    type: (
                      [
                        'RATING_4',
                        'RATING_5',
                        'RATING_10',
                        'NUMBER',
                        'MULTIPLE_CHOICE',
                        'YES_NO',
                        'LONG_TEXT',
                      ] as const
                    )[Math.min(i, 6)],
                    options: i === 4 ? ['A', 'B'] : [],
                    required: false,
                  })),
                },
              },
              include: { questions: { orderBy: { position: 'asc' } } },
            });
            try {
              const people = Array.from({ length: 125 }, (_, i) => ({
                id: randomUUID(),
                sessionId: training.id,
                firstName: i === 124 ? 'Zoé' : `Test${i}`,
                lastName: i === 124 ? 'Charlier' : `A${String(i).padStart(3, '0')}`,
                email: `person${i}@example.org`,
                tokenHash: hashToken(generateToken()),
                tokenEncrypted: 'unused-test-value',
                submittedAt: i < 25 ? new Date() : null,
              }));
              await db.participant.createMany({ data: people });
              await db.response.createMany({
                data: people
                  .slice(0, 25)
                  .map((p) => ({
                    participantId: p.id,
                    sessionId: training.id,
                    answers: training.questions
                      .slice(0, 7)
                      .map((q, i) => ({
                        questionId: q.id,
                        value: [4, 5, 10, 100, ['A', 'B'], true, 'Suggestion'][i],
                        ...(i === 0 ? { comment: 'Commentaire de test' } : {}),
                      })),
                  })),
              });
              const first = await statistics(training.id);
              assert.equal(first.results.length, 50);
              assert.equal(first.resultsTotal, 61);
              assert.equal(first.results[0].comments.length, 20);
              assert.equal(first.results[0].commentCount, 25);
              assert.equal(first.satisfaction, 4);
              assert.equal(first.results[3].average, 100);
              assert.deepEqual(first.results[4].distribution, { A: 25, B: 25 });
              assert.deepEqual(first.results[5].distribution, { Oui: 25, Non: 0 });
              const second = await statistics(training.id, { page: 2 });
              assert.equal(second.results.length, 11);
              assert.equal(
                second.results.some((q) => first.results.some((f) => f.id === q.id)),
                false,
              );
              const summary = await statistics(training.id, { summary: true });
              assert.equal(summary.responses, 25);
              assert.equal(summary.satisfaction, first.satisfaction);
              assert.deepEqual(summary.results, []);
              const { listParticipants } = await import('../../src/lib/participants');
              assert.equal(
                (await listParticipants(training.id, 1)).items.some(
                  (p) => p.lastName === 'Charlier',
                ),
                false,
              );
              const found = await listParticipants(training.id, 1, {
                q: 'Zoé Charlier',
                status: 'PENDING',
              });
              assert.equal(found.total, 1);
              assert.equal(found.items[0].email, 'person124@example.org');
              assert.equal(
                (await listParticipants(training.id, 1, { q: 'Charlier', status: 'DONE' })).total,
                0,
              );
              assert.equal((await listParticipants(training.id, 1, { status: 'DONE' })).total, 25);
            } finally {
              await db.trainingSession.delete({ where: { id: training.id } });
            }
          },
        );
        await t.test(
          'rapports : périodes inclusives, anciennes dates nulles et même nom de formation',
          async () => {
            const fixtures = [
              {
                id: 'REPORT-SPAN',
                date: '2026-12-09',
                endDate: '2026-12-12',
                note: 2,
                pending: true,
              },
              { id: 'REPORT-LEGACY', date: '2026-12-12', endDate: null, note: 3, pending: false },
              {
                id: 'REPORT-OUTSIDE',
                date: '2026-12-13',
                endDate: '2026-12-14',
                note: 1,
                pending: false,
              },
            ];
            try {
              for (const fixture of fixtures) {
                const training = await db.trainingSession.create({
                  data: {
                    id: fixture.id,
                    name: session.name,
                    trainer: 'Test',
                    date: new Date(fixture.date),
                    endDate: fixture.endDate ? new Date(fixture.endDate) : null,
                    questions: { create: { label: 'Satisfaction', type: 'RATING_4', position: 0 } },
                  },
                  include: { questions: true },
                });
                const respondent = await db.participant.create({
                  data: {
                    sessionId: training.id,
                    firstName: 'Test',
                    lastName: 'Rapport',
                    email: 'report@example.com',
                    tokenHash: hashToken(generateToken()),
                    tokenEncrypted: encryptToken(generateToken()),
                  },
                });
                await db.response.create({
                  data: {
                    sessionId: training.id,
                    participantId: respondent.id,
                    submittedAt: new Date('2027-01-02'),
                    answers: [{ questionId: training.questions[0].id, value: fixture.note }],
                  },
                });
                if (fixture.pending)
                  await db.participant.create({
                    data: {
                      sessionId: training.id,
                      firstName: 'Autre',
                      lastName: 'Test',
                      email: 'pending@example.com',
                      tokenHash: hashToken(generateToken()),
                      tokenEncrypted: encryptToken(generateToken()),
                    },
                  });
              }
              const day = await statistics({ dateFrom: '2026-12-11', dateTo: '2026-12-11' });
              assert.equal(day.sessions, 2);
              assert.equal(day.participants, 3);
              assert.equal(day.responses, 2);
              assert.equal(day.responseRate, (2 / 3) * 100);
              assert.equal(day.satisfaction, 3);
              assert.deepEqual(
                new Set(day.results.map((q) => q.sessionId)),
                new Set([session.id, 'REPORT-SPAN']),
              );
              const legacy = await statistics({ dateFrom: '2026-12-12', dateTo: '2026-12-12' });
              assert.equal(legacy.sessions, 2);
              assert.equal(legacy.responses, 2);
              assert.equal(legacy.satisfaction, 2.5);
              const exact = await statistics({
                sessionId: 'REPORT-LEGACY',
                dateFrom: '2026-12-12',
                dateTo: '2026-12-12',
              });
              assert.equal(exact.sessions, 1);
              assert.equal(exact.satisfaction, 3);
              const excluded = await statistics({
                sessionId: 'REPORT-OUTSIDE',
                dateTo: '2026-12-11',
              });
              assert.equal(excluded.sessions, 0);
              assert.equal(excluded.participants, 0);
              assert.equal(excluded.responses, 0);
              assert.equal(excluded.satisfaction, null);
            } finally {
              await db.trainingSession.deleteMany({
                where: { id: { in: fixtures.map((fixture) => fixture.id) } },
              });
            }
          },
        );
        await t.test('limitation partagée entre appels concurrents', async () => {
          const results = await Promise.allSettled(
            Array.from({ length: 8 }, () => rateLimit('test-limit', 3, 60)),
          );
          assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
          assert.equal(
            results.filter(
              (r) =>
                r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 429,
            ).length,
            5,
          );
        });
        await t.test(
          'le lien d’une autre session et les sessions fermées sont refusés',
          async () => {
            await db.trainingSession.create({
              data: { id: 'OTHER-001', name: 'Autre session', date: new Date(), trainer: 'Test' },
            });
            await assert.rejects(
              submitResponse({ ...input, sessionId: 'OTHER-001' }, 'ip-test'),
              (e: unknown) => e instanceof ApiError && e.status === 404,
            );
            const token2 = generateToken();
            await db.participant.create({
              data: {
                sessionId: session.id,
                firstName: 'Marie',
                lastName: 'Test',
                email: 'marie@example.com',
                tokenHash: hashToken(token2),
                tokenEncrypted: encryptToken(token2),
              },
            });
            await db.trainingSession.update({
              where: { id: session.id },
              data: { status: 'ARCHIVED' },
            });
            await assert.rejects(
              submitResponse({ ...input, token: token2 }, 'ip-test'),
              (e: unknown) => e instanceof ApiError && e.status === 410,
            );
            assert.equal(await db.response.count(), 1);
          },
        );
        await t.test(
          'une défaillance de livraison garde la réponse et planifie une reprise',
          async () => {
            process.env.POWER_AUTOMATE_WEBHOOK_URL = 'https://example.invalid/flow';
            const previousFetch = globalThis.fetch;
            globalThis.fetch = async () => {
              throw new Error('Network error with secret URL');
            };
            try {
              await deliverWebhooks();
              const event = await db.webhookDelivery.findFirstOrThrow();
              assert.equal(event.attempts, 1);
              assert.equal(event.deliveredAt, null);
              assert.equal(event.lockedUntil, null);
              assert.ok(event.nextAttemptAt.getTime() > Date.now());
              assert.equal(event.lastError, 'Erreur réseau ou délai dépassé');
              assert.equal(await db.response.count(), 1);
            } finally {
              globalThis.fetch = previousFetch;
            }
          },
        );
        await t.test('RLS activée sur toutes les tables de l’application', async () => {
          const tables = await db.$queryRaw<
            { relname: string; relrowsecurity: boolean }[]
          >`SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind='r'`;
          assert.equal(tables.length, 16);
          assert.ok(tables.every((t) => t.relrowsecurity));
        });
        await t.test(
          'enrichissement des anciennes réponses et accusé HTTP explicite sans double livraison concurrente',
          async () => {
            const event = await db.webhookDelivery.findFirstOrThrow();
            await db.webhookDelivery.update({
              where: { id: event.id },
              data: {
                payload: { eventId: event.id, sessionId: session.id, answers: [] },
                nextAttemptAt: new Date(0),
              },
            });
            const previousFetch = globalThis.fetch;
            const bodies: Record<string, unknown>[] = [];
            try {
              globalThis.fetch = async (_url, options) => {
                const body = JSON.parse(String(options?.body));
                bodies.push(body);
                assert.equal(new Headers(options?.headers).get('Idempotency-Key'), event.id);
                return new Response(null, { status: 202 });
              };
              await deliverWebhooks(event.id);
              const rejected = await db.webhookDelivery.findUniqueOrThrow({
                where: { id: event.id },
              });
              assert.equal(rejected.deliveredAt, null);
              assert.equal(rejected.lastError, 'Accusé de réception Power Automate invalide');
              assert.equal(bodies[0].sessionParticipantCount, 2);
              assert.equal(bodies[0].sessionResponseCount, 1);
              assert.equal(bodies[0].sessionParticipationPercent, 50);
              assert.equal(bodies[0].participantScore, 4);
              await db.webhookDelivery.update({
                where: { id: event.id },
                data: { nextAttemptAt: new Date(0) },
              });
              let successes = 0;
              globalThis.fetch = async (_url, options) => {
                successes++;
                const body = JSON.parse(String(options?.body));
                return Response.json({ received: true, eventId: body.eventId });
              };
              await Promise.all([deliverWebhooks(event.id), deliverWebhooks(event.id)]);
              assert.equal(successes, 1);
              const sent = await db.webhookDelivery.findUniqueOrThrow({ where: { id: event.id } });
              assert.ok(sent.deliveredAt);
              assert.equal(sent.lastError, null);
              assert.equal(sent.lockedUntil, null);
              await deliverWebhooks(event.id);
              assert.equal(successes, 1);
              assert.equal(await db.response.count(), 1);
            } finally {
              globalThis.fetch = previousFetch;
              delete process.env.POWER_AUTOMATE_WEBHOOK_URL;
            }
          },
        );
        await t.test(
          'modèle PDF conservé par session et suppression protégée par une clé étrangère',
          async () => {
            const { builtinPdfTemplates, templateInput, sessionPdfTemplateKey } =
              await import('../../src/lib/pdf-template');
            const { resolvePdfTemplate } = await import('../../src/lib/pdf-templates-server');
            const initial = await db.trainingSession.findUniqueOrThrow({
              where: { id: session.id },
            });
            assert.equal(sessionPdfTemplateKey(initial), 'hot-classic');
            const template = await db.pdfTemplate.create({
              data: {
                ...templateInput(builtinPdfTemplates[1]),
                name: 'Modèle de la session',
                heading: 'Texte propre à ce modèle',
              },
            });
            const updated = await db.trainingSession.update({
              where: { id: session.id },
              data: { pdfTemplateId: template.id },
            });
            assert.equal(sessionPdfTemplateKey(updated), template.id);
            assert.equal(
              (await resolvePdfTemplate(sessionPdfTemplateKey(updated))).heading,
              template.heading,
            );
            await assert.rejects(
              db.pdfTemplate.delete({ where: { id: template.id } }),
              (error: unknown) =>
                !!error && typeof error === 'object' && 'code' in error && error.code === 'P2003',
            );
            const preset = await db.trainingSession.update({
              where: { id: session.id },
              data: { pdfTemplateId: null, pdfPreset: 'hot-banner' },
            });
            assert.equal(sessionPdfTemplateKey(preset), 'hot-banner');
            await db.pdfTemplate.delete({ where: { id: template.id } });
          },
        );
        await t.test(
          'mise à jour du questionnaire : liens conservés, ancienne réponse intacte et notes sur 4',
          async () => {
            const { upgradeStandardQuestionnaires } =
              await import('../../src/lib/questionnaire-upgrade');
            const legacy = await db.trainingSession.create({
              data: {
                id: 'LEGACY-001',
                name: 'Ancien questionnaire',
                date: new Date(),
                trainer: 'Test',
                status: 'ACTIVE',
                questions: {
                  create: legacyDefaultQuestions.map((q, position) => ({ ...q, position })),
                },
              },
              include: { questions: { orderBy: { position: 'asc' } } },
            });
            const answeredToken = generateToken(),
              pendingToken = generateToken();
            for (const [email, token] of [
              ['old@example.com', answeredToken],
              ['pending@example.com', pendingToken],
            ])
              await db.participant.create({
                data: {
                  sessionId: legacy.id,
                  firstName: 'Test',
                  lastName: 'Migration',
                  email,
                  tokenHash: hashToken(token),
                  tokenEncrypted: encryptToken(token),
                },
              });
            await submitResponse(
              {
                sessionId: legacy.id,
                token: answeredToken,
                answers: legacy.questions.slice(0, 3).map((q) => ({ questionId: q.id, value: 5 })),
              },
              'test-migration',
            );
            const original = await db.response.findFirstOrThrow({
              where: { sessionId: legacy.id },
            });
            const preview = await upgradeStandardQuestionnaires(db);
            assert.equal(preview.length, 1);
            assert.equal(preview[0].updated, false);
            const updated = await upgradeStandardQuestionnaires(db, true);
            assert.equal(updated[0].responses, 1);
            assert.equal(updated[0].participants, 2);
            const current = await db.question.findMany({
              where: { sessionId: legacy.id, active: true },
              orderBy: { position: 'asc' },
            });
            assert.equal(current.length, 12);
            assert.equal(current[0].label, defaultQuestions[0].label);
            assert.equal(
              await db.question.count({ where: { sessionId: legacy.id, active: false } }),
              4,
            );
            assert.deepEqual(
              (await db.response.findUniqueOrThrow({ where: { id: original.id } })).answers,
              original.answers,
            );
            await assert.rejects(
              submitResponse(
                { sessionId: legacy.id, token: answeredToken, answers: [] },
                'test-migration',
              ),
              (e: unknown) => e instanceof ApiError && e.status === 409,
            );
            await assert.rejects(
              submitResponse(
                {
                  sessionId: legacy.id,
                  token: pendingToken,
                  answers: legacy.questions
                    .slice(0, 3)
                    .map((q) => ({ questionId: q.id, value: 5 })),
                },
                'test-migration',
              ),
              (e: unknown) => e instanceof ApiError && e.status === 400,
            );
            await submitResponse(
              {
                sessionId: legacy.id,
                token: pendingToken,
                answers: current.slice(0, 11).map((q, i) => ({
                  questionId: q.id,
                  value: 4,
                  ...(i === 0 ? { comment: 'Nouveau formulaire apprécié.' } : {}),
                })),
              },
              'test-migration',
            );
            assert.deepEqual(await upgradeStandardQuestionnaires(db, true), []);
            const result = await statistics(legacy.id);
            assert.equal(result.responses, 2);
            assert.equal(result.satisfaction, 4);
            assert.equal(result.results.filter((q) => q.archived && q.count > 0).length, 3);
            assert.deepEqual(result.results.find((q) => q.id === current[0].id)?.comments, [
              'Nouveau formulaire apprécié.',
            ]);
            const pending = await db.participant.findUniqueOrThrow({
              where: { tokenHash: hashToken(pendingToken) },
            });
            assert.ok(pending.submittedAt);
          },
        );
        await t.test(
          'statistiques cohérentes sous soumissions simultanées et recalcul après import ou modification',
          async () => {
            const { queueSessionIntegration } = await import('../../src/lib/power-automate');
            const { lockSession } = await import('../../src/lib/sessions');
            const tokens = Array.from({ length: 5 }, () => generateToken());
            const training = await db.trainingSession.create({
              data: {
                id: 'SHAREPOINT-METRICS',
                name: 'Formation SharePoint',
                trainer: 'Test',
                date: new Date('2026-12-11'),
                status: 'ACTIVE',
                questions: {
                  create: [
                    { label: 'Satisfaction', type: 'RATING_4', required: true, position: 0 },
                  ],
                },
                participants: {
                  create: tokens.map((token, i) => ({
                    firstName: `Prénom ${i}`,
                    lastName: 'Test',
                    email: `sharepoint${i}@example.com`,
                    tokenHash: hashToken(token),
                    tokenEncrypted: encryptToken(token),
                  })),
                },
              },
              include: { questions: true },
            });
            await Promise.all(
              [1, 2, 4].map((value, i) =>
                submitResponse(
                  {
                    sessionId: training.id,
                    token: tokens[i],
                    answers: [{ questionId: training.questions[0].id, value }],
                  },
                  'test-metrics',
                ),
              ),
            );
            const events = await db.webhookDelivery.findMany({
              where: { payload: { path: ['sessionId'], equals: training.id } },
            });
            const payloads = events
              .map((e) => e.payload as Record<string, unknown>)
              .sort((a, b) => Number(a.sessionVersion) - Number(b.sessionVersion));
            assert.deepEqual(
              payloads.map((p) => p.sessionVersion),
              [1, 2, 3],
            );
            assert.deepEqual(
              payloads.map((p) => p.sessionResponseCount),
              [1, 2, 3],
            );
            assert.equal(payloads[2].sessionParticipationPercent, 60);
            assert.equal(payloads[2].sessionAverageScore, 2.33);
            assert.equal(payloads[2].sessionSatisfactionPercent, 58.33);
            const eventId = await db.$transaction(async (tx) => {
              await lockSession(tx, training.id);
              const token = generateToken();
              await tx.participant.create({
                data: {
                  sessionId: training.id,
                  firstName: 'Nouveau',
                  lastName: 'Test',
                  email: 'new-sharepoint@example.com',
                  tokenHash: hashToken(token),
                  tokenEncrypted: encryptToken(token),
                },
              });
              await tx.trainingSession.update({
                where: { id: training.id },
                data: { integrationRevision: { increment: 1 } },
              });
              return queueSessionIntegration(tx, training.id);
            });
            assert.ok(eventId);
            const update = (await db.webhookDelivery.findUniqueOrThrow({ where: { id: eventId } }))
              .payload as Record<string, unknown>;
            assert.equal(update.eventType, 'satisfaction.session');
            assert.equal(update.sessionVersion, 4);
            assert.equal(update.sessionParticipantCount, 6);
            assert.equal(update.sessionParticipationPercent, 50);
            assert.equal(update.participantId, undefined);
            assert.equal(update.answers, undefined);
            const renamedEventId = await db.$transaction(async (tx) => {
              await lockSession(tx, training.id);
              await tx.trainingSession.update({
                where: { id: training.id },
                data: { name: 'Formation renommée', integrationRevision: { increment: 1 } },
              });
              return queueSessionIntegration(tx, training.id);
            });
            const renamed = (
              await db.webhookDelivery.findUniqueOrThrow({ where: { id: renamedEventId! } })
            ).payload as Record<string, unknown>;
            assert.equal(renamed.sessionName, 'Formation renommée');
            assert.equal(renamed.sessionVersion, 5);
            assert.equal(renamed.sessionSatisfactionPercent, 58.33);
          },
        );
        await t.test(
          'Odoo : file transactionnelle, concurrence, isolation et aucun renvoi après résultat incertain',
          async () => {
            const { deliverOdoo, queueOdoo } = await import('../../src/lib/odoo');
            const originalFetch = globalThis.fetch;
            const previousEnv = { ...process.env };
            Object.assign(process.env, {
              ODOO_UAT_ENABLED: 'true',
              ODOO_UAT_SOURCE_SESSION_ID: 'ODOO-LOCAL',
              ODOO_UAT_SESSION_ID: '203238',
              ODOO_UAT_SATISFACTION_URL: testOdooUrl,
              ODOO_UAT_SESSION_NAME: 'Formation test ADR',
              ODOO_UAT_TRAINER: 'Formateur Test',
            });
            let gets = 0,
              posts = 0,
              uncertain = false;
            globalThis.fetch = async (_, options) => {
              if (options?.method !== 'POST') {
                gets++;
                return new Response(odooFixture(), {
                  headers: { 'Set-Cookie': 'session_id=test' },
                });
              }
              posts++;
              await new Promise((resolve) => setTimeout(resolve, 25));
              if (uncertain) throw new Error('Timeout after remote commit');
              return Response.json({ result: { success: true } });
            };
            try {
              const training = await db.trainingSession.create({
                data: {
                  id: 'ODOO-LOCAL',
                  name: 'Formation test ADR',
                  trainer: 'Formateur Test',
                  date: new Date(),
                  status: 'ACTIVE',
                  questions: {
                    create: defaultQuestions.map((q, position) => ({ ...q, position })),
                  },
                },
                include: { questions: true },
              });
              async function responseFor(index: number) {
                const token = generateToken();
                await db.participant.create({
                  data: {
                    sessionId: training.id,
                    firstName: 'Test',
                    lastName: 'Odoo',
                    email: `odoo-${index}@example.com`,
                    tokenHash: hashToken(token),
                    tokenEncrypted: encryptToken(token),
                  },
                });
                return submitResponse(
                  {
                    sessionId: training.id,
                    token,
                    answers: training.questions
                      .slice(0, 11)
                      .map((q) => ({ questionId: q.id, value: 4 })),
                  },
                  'test-odoo',
                );
              }
              // Prisma nested create order is not a contract: select the actual rating questions.
              training.questions.sort((a, b) => a.position - b.position);
              const id = await responseFor(1);
              assert.ok(await db.webhookDelivery.findUnique({ where: { id: `odoo:${id}` } }));
              process.env.POWER_AUTOMATE_WEBHOOK_URL = 'https://flow.example.com';
              await deliverWebhooks(`odoo:${id}`);
              assert.equal(gets + posts, 0, 'Power Automate must never claim Odoo jobs');
              await Promise.all([deliverOdoo(id), deliverOdoo(id)]);
              const firstAttempt = await db.webhookDelivery.findUniqueOrThrow({
                where: { id: `odoo:${id}` },
              });
              assert.equal(
                posts,
                1,
                JSON.stringify({
                  state: (firstAttempt.payload as { state: string }).state,
                  error: firstAttempt.lastError,
                }),
              );
              assert.equal(gets, 1);
              assert.ok(
                (await db.webhookDelivery.findUniqueOrThrow({ where: { id: `odoo:${id}` } }))
                  .deliveredAt,
              );
              await db.$transaction((tx) => queueOdoo(tx, training.id, id));
              await deliverOdoo(id);
              assert.equal(posts, 1);
              const unknownId = await responseFor(2);
              uncertain = true;
              await deliverOdoo(unknownId);
              const unknown = await db.webhookDelivery.findUniqueOrThrow({
                where: { id: `odoo:${unknownId}` },
              });
              assert.equal((unknown.payload as { state: string }).state, 'UNKNOWN');
              assert.equal(unknown.deliveredAt, null);
              await db.webhookDelivery.update({
                where: { id: unknown.id },
                data: { nextAttemptAt: new Date(0), lockedUntil: new Date(0) },
              });
              await db.$transaction((tx) => queueOdoo(tx, training.id, unknownId));
              await deliverOdoo(unknownId);
              assert.equal(posts, 2);
              await db.webhookDelivery.update({
                where: { id: unknown.id },
                data: { payload: { ...(unknown.payload as object), state: 'POSTING' } },
              });
              await deliverOdoo(unknownId);
              assert.equal(posts, 2, 'A crashed worker must not retry a POST');
              const changedId = await responseFor(3);
              process.env.ODOO_UAT_SATISFACTION_URL = testOdooUrl.replace('aaaaaaaa', 'bbbbbbbb');
              await deliverOdoo(changedId);
              assert.equal(posts, 2);
              assert.equal(gets, 2);
              const changed = await db.webhookDelivery.findUniqueOrThrow({
                where: { id: `odoo:${changedId}` },
              });
              assert.equal((changed.payload as { state: string }).state, 'FAILED');
              assert.match(changed.lastError || '', /cible Odoo a changé/);
              const lowToken = generateToken();
              const lowParticipant = await db.participant.create({
                data: {
                  sessionId: training.id,
                  firstName: 'Test',
                  lastName: 'Commentaire',
                  email: 'odoo-comment@example.com',
                  tokenHash: hashToken(lowToken),
                  tokenEncrypted: encryptToken(lowToken),
                },
              });
              await assert.rejects(
                submitResponse(
                  {
                    sessionId: training.id,
                    token: lowToken,
                    answers: training.questions
                      .slice(0, 11)
                      .map((q, i) => ({ questionId: q.id, value: i === 0 ? 2 : 4 })),
                  },
                  'test-odoo',
                ),
                (e: unknown) =>
                  e instanceof ApiError &&
                  e.status === 400 &&
                  /commentaire est requis/.test(e.message),
              );
              assert.equal(
                (await db.participant.findUniqueOrThrow({ where: { id: lowParticipant.id } }))
                  .submittedAt,
                null,
              );
              assert.equal(
                await db.response.count({ where: { participantId: lowParticipant.id } }),
                0,
              );
              // A worker suspended during GET loses its lease; only its replacement may POST.
              process.env.ODOO_UAT_SATISFACTION_URL = testOdooUrl;
              const leaseId = await responseFor(4);
              let release!: () => void, started!: () => void;
              const gate = new Promise<void>((resolve) => {
                release = resolve;
              });
              const reading = new Promise<void>((resolve) => {
                started = resolve;
              });
              let firstRead = true,
                leasePosts = 0;
              globalThis.fetch = async (_, options) => {
                if (options?.method === 'POST') {
                  leasePosts++;
                  return Response.json({ result: { success: true } });
                }
                if (firstRead) {
                  firstRead = false;
                  started();
                  await gate;
                }
                return new Response(odooFixture(), {
                  headers: { 'Set-Cookie': 'session_id=test' },
                });
              };
              const suspended = deliverOdoo(leaseId);
              try {
                await reading;
                await db.webhookDelivery.update({
                  where: { id: `odoo:${leaseId}` },
                  data: { lockedUntil: new Date(0) },
                });
                await deliverOdoo(leaseId);
              } finally {
                release();
                await suspended;
              }
              assert.equal(leasePosts, 1, 'The worker that lost its lease must never POST');
            } finally {
              globalThis.fetch = originalFetch;
              for (const key of Object.keys(process.env))
                if (!(key in previousEnv)) delete process.env[key];
              Object.assign(process.env, previousEnv);
            }
          },
        );
        await t.test(
          'Odoo par session : chiffrement, destinations distinctes, désactivation et reprise sûre après changement de lien',
          async () => {
            const { saveOdooConnection, getOdooConfig } = await import('../../src/lib/odoo-config');
            const { deliverOdoo, queueOdoo, odooStatus } = await import('../../src/lib/odoo');
            const originalFetch = globalThis.fetch;
            const urls = [
              testOdooUrl,
              testOdooUrl
                .replace('odoo.uat.houseoftraining.lu', 'www.houseoftraining.lu')
                .replace('aaaaaaaa', 'bbbbbbbb'),
            ];
            const posted: { origin: string; token: string; email: string }[] = [];
            let outage = false;
            globalThis.fetch = async (url, options) => {
              if (options?.method !== 'POST') {
                if (outage) throw new Error('GET temporarily unavailable');
                const token = new URL(String(url)).pathname.split('/').at(-1)!;
                return new Response(
                  odooFixture().replaceAll('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', token),
                  { headers: { 'Set-Cookie': 'session_id=fresh' } },
                );
              }
              const body = JSON.parse(String(options.body));
              posted.push({
                origin: new URL(String(url)).origin,
                token: body.access_token,
                email: body['20'],
              });
              return Response.json({ result: { success: true } });
            };
            try {
              const sources: { training: { id: string }; responseId: string }[] = [];
              for (let index = 0; index < 2; index++) {
                const training = await db.trainingSession.create({
                  data: {
                    id: `ODOO-MULTI-${index}`,
                    name: `Nom local ${index}`,
                    trainer: 'Formateur local',
                    date: new Date(),
                    status: 'ACTIVE',
                    questions: {
                      create: defaultQuestions.map((q, position) => ({ ...q, position })),
                    },
                  },
                  include: { questions: { orderBy: { position: 'asc' } } },
                });
                await db.$transaction((tx) =>
                  saveOdooConnection(tx, training.id, urls[index], true),
                );
                const stored = await db.odooConnection.findUniqueOrThrow({
                  where: { sessionId: training.id },
                });
                assert.equal(stored.urlEncrypted.includes('https'), false);
                assert.equal(decryptToken(stored.urlEncrypted), urls[index]);
                const token = generateToken();
                await db.participant.create({
                  data: {
                    sessionId: training.id,
                    firstName: 'Prénom',
                    lastName: 'Nom',
                    email: `multi-${index}@example.com`,
                    tokenHash: hashToken(token),
                    tokenEncrypted: encryptToken(token),
                  },
                });
                const responseId = await submitResponse(
                  {
                    sessionId: training.id,
                    token,
                    answers: training.questions
                      .slice(0, 11)
                      .map((q) => ({ questionId: q.id, value: 4 })),
                  },
                  'test-multi',
                );
                sources.push({ training, responseId });
              }
              await db.$transaction((tx) =>
                saveOdooConnection(tx, sources[0].training.id, undefined, false),
              );
              assert.equal(await getOdooConfig(sources[0].training.id), null);
              await deliverOdoo(sources[0].responseId);
              assert.equal(posted.length, 0);
              await deliverOdoo(undefined, sources[1].training.id);
              assert.deepEqual(posted, [
                {
                  origin: 'https://www.houseoftraining.lu',
                  token: new URL(urls[1]).pathname.split('/').at(-1),
                  email: 'multi-1@example.com',
                },
              ]);
              await db.$transaction((tx) =>
                saveOdooConnection(tx, sources[0].training.id, undefined, true),
              );
              outage = true;
              await deliverOdoo(sources[0].responseId);
              const failed = await db.webhookDelivery.findUniqueOrThrow({
                where: { id: `odoo:${sources[0].responseId}` },
              });
              assert.equal((failed.payload as { state: string }).state, 'FAILED');
              const replacement = urls[0].replace('aaaaaaaa', 'cccccccc');
              await db.$transaction((tx) =>
                saveOdooConnection(tx, sources[0].training.id, replacement, true),
              );
              await db.$transaction((tx) =>
                queueOdoo(tx, sources[0].training.id, sources[0].responseId),
              );
              outage = false;
              await deliverOdoo(sources[0].responseId);
              assert.equal(posted.length, 2);
              assert.equal(posted[1].token, new URL(replacement).pathname.split('/').at(-1));
              await db.$transaction((tx) =>
                queueOdoo(tx, sources[0].training.id, sources[0].responseId),
              );
              await deliverOdoo(sources[0].responseId);
              assert.equal(posted.length, 2);
              const status = await odooStatus(sources[0].training.id);
              assert.equal(status.sent, 1);
              assert.equal('url' in status, false);
              assert.equal((await odooStatus(sources[0].training.id, true)).url, replacement);
              await db.$transaction((tx) =>
                saveOdooConnection(tx, sources[0].training.id, '', false),
              );
              assert.equal(await getOdooConfig(sources[0].training.id), null);
              await db.trainingSession.delete({ where: { id: sources[1].training.id } });
              assert.equal(
                await db.odooConnection.count({ where: { sessionId: sources[1].training.id } }),
                0,
              );
            } finally {
              globalThis.fetch = originalFetch;
            }
          },
        );
        await t.test(
          'Conservation : suppression à échéance uniquement, cascade complète, envois actifs protégés et nettoyages concurrents',
          async () => {
            const { purgeArchivedSessions, deleteArchivedSession, retentionOverview } =
              await import('../../src/lib/retention');
            const now = new Date('2027-02-28T10:00:00.000Z');
            const create = (
              id: string,
              status: 'ARCHIVED' | 'ACTIVE' | 'DRAFT',
              archivedAt: Date,
            ) =>
              db.trainingSession.create({
                data: {
                  id,
                  name: 'Test conservation',
                  trainer: 'Test',
                  date: new Date('2026-10-22'),
                  status,
                  archivedAt,
                },
              });
            const expired = await create(
              'RETENTION-EXPIRED',
              'ARCHIVED',
              new Date('2027-01-31T10:00:00Z'),
            );
            const recent = await create(
              'RETENTION-RECENT',
              'ARCHIVED',
              new Date('2027-01-31T10:00:00.001Z'),
            );
            const active = await create('RETENTION-ACTIVE', 'ACTIVE', new Date('2020-01-01'));
            const draft = await create('RETENTION-DRAFT', 'DRAFT', new Date('2020-01-01'));
            const busy = await create('RETENTION-BUSY', 'ARCHIVED', new Date('2027-01-01'));
            const token = generateToken();
            const participant = await db.participant.create({
              data: {
                sessionId: expired.id,
                firstName: 'Test',
                lastName: 'Suppression',
                email: 'retention@example.com',
                tokenHash: hashToken(token),
                tokenEncrypted: encryptToken(token),
              },
            });
            await db.question.create({
              data: {
                sessionId: expired.id,
                label: 'Question supprimée',
                type: 'RATING_4',
                position: 0,
              },
            });
            await db.response.create({
              data: { sessionId: expired.id, participantId: participant.id, answers: [] },
            });
            await db.odooConnection.create({
              data: { sessionId: expired.id, urlEncrypted: encryptToken(testOdooUrl) },
            });
            await db.webhookDelivery.createMany({
              data: [
                {
                  id: 'retention-copy',
                  payload: { sessionId: expired.id, email: 'retention@example.com' },
                },
                {
                  id: 'retention-busy',
                  payload: { sessionId: busy.id },
                  lockedUntil: new Date(now.getTime() + 60000),
                },
              ],
            });
            await db.integrationEvent.create({
              data: {
                id: 'retention-inbound',
                payload: { sessionId: expired.id, email: 'retention@example.com' },
              },
            });
            await db.retentionSettings.update({
              where: { id: 'retention' },
              data: { enabled: false, value: 1, unit: 'MONTHS' },
            });
            assert.equal((await purgeArchivedSessions(now)).deleted, 0);
            assert.ok(await db.trainingSession.findUnique({ where: { id: expired.id } }));
            assert.equal((await retentionOverview(now)).dueCount, 2);
            await db.retentionSettings.update({
              where: { id: 'retention' },
              data: { enabled: true },
            });
            const outcomes = await Promise.all([
              purgeArchivedSessions(now),
              purgeArchivedSessions(now),
            ]);
            assert.equal(
              outcomes.reduce((sum, item) => sum + item.deleted, 0),
              1,
            );
            assert.deepEqual(
              await Promise.all([
                db.participant.count({ where: { sessionId: expired.id } }),
                db.question.count({ where: { sessionId: expired.id } }),
                db.response.count({ where: { sessionId: expired.id } }),
                db.odooConnection.count({ where: { sessionId: expired.id } }),
              ]),
              [0, 0, 0, 0],
            );
            assert.equal(await db.webhookDelivery.count({ where: { id: 'retention-copy' } }), 0);
            assert.equal(
              await db.integrationEvent.count({ where: { id: 'retention-inbound' } }),
              0,
            );
            assert.equal(
              await db.auditLog.count({
                where: { action: 'SESSION_AUTO_DELETED', resourceId: expired.id },
              }),
              1,
            );
            assert.equal(
              await db.trainingSession.count({
                where: { id: { in: [recent.id, active.id, draft.id, busy.id] } },
              }),
              4,
            );
            await db.webhookDelivery.update({
              where: { id: 'retention-busy' },
              data: { lockedUntil: null },
            });
            assert.equal((await purgeArchivedSessions(now)).deleted, 1);
            await db.trainingSession.update({
              where: { id: recent.id },
              data: { status: 'ACTIVE', archivedAt: null },
            });
            assert.equal((await purgeArchivedSessions(new Date('2027-04-01'))).deleted, 0);
            assert.equal(
              await db.$transaction((tx) =>
                deleteArchivedSession(tx, active.id, { ipHash: 'manual-test' }),
              ),
              'notArchived',
            );
            await db.trainingSession.update({
              where: { id: recent.id },
              data: { status: 'ARCHIVED', archivedAt: new Date('2027-04-01') },
            });
            assert.equal(
              await db.$transaction((tx) =>
                deleteArchivedSession(tx, recent.id, { ipHash: 'manual-test' }),
              ),
              'deleted',
            );
            assert.equal(
              await db.auditLog.count({
                where: { action: 'SESSION_MANUALLY_DELETED', resourceId: recent.id },
              }),
              1,
            );
            await db.retentionSettings.update({
              where: { id: 'retention' },
              data: { enabled: false, value: 2, unit: 'MONTHS' },
            });
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
