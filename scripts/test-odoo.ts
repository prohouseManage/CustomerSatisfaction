import { loadEnvConfig } from '@next/env';
import { odooConfig, prepareOdoo, OdooError } from '../src/lib/odoo-client';
import { defaultQuestions, type Answer } from '../src/lib/validation';
import { generateToken, hashToken, encryptToken, decryptToken } from '../src/lib/crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
loadEnvConfig(process.cwd());
async function main() {
  if (!process.argv.includes('--prepare') && !process.argv.includes('--send-test'))
    throw new OdooError('Utiliser --prepare ou --send-test.');
  const config = odooConfig();
  if (!config || config.sourceSessionId !== '203238' || config.targetSessionId !== '203238')
    throw new OdooError('Configuration de test 203238 requise.');
  const questions = defaultQuestions.map((q, i) => ({ ...q, id: `preview-${i}` }));
  const suggestion =
    'TEST TECHNIQUE D’INTÉGRATION APPLICATION / ODOO UAT — SESSION 203238 — ÉVALUATION FICTIVE, NE PAS EXPLOITER.';
  const preview = {
    id: 'preview-only',
    participant: {
      firstName: 'TEST ODOO',
      lastName: 'TECHNIQUE',
      email: 'test-203238@example.com',
    },
    questions,
    answers: questions.map((q, i) => ({
      questionId: q.id,
      value: i < 11 ? 4 : suggestion,
      ...(i === 0 ? { comment: 'TEST TECHNIQUE — transmission du commentaire.' } : {}),
    })),
  };
  // Read only: validates the real form and current CSRF/cookie contract before touching the database.
  await prepareOdoo(config, preview);
  const { db } = await import('../src/lib/db');
  try {
    let session = await db.trainingSession.findUnique({
      where: { id: config.sourceSessionId },
      include: { questions: true },
    });
    if (
      session?.name === 'test' &&
      session.description.trim() === new URL(config.url).pathname.split('/').at(-1)
    ) {
      session = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "TrainingSession" WHERE id = ${config.sourceSessionId} FOR UPDATE`;
        if (
          (await tx.participant.count({ where: { sessionId: config.sourceSessionId } })) ||
          (await tx.response.count({ where: { sessionId: config.sourceSessionId } }))
        )
          throw new OdooError(
            'La session de test contient désormais des données. Métadonnées conservées.',
          );
        return tx.trainingSession.update({
          where: { id: config.sourceSessionId },
          data: {
            name: config.sessionName,
            trainer: config.trainer,
            status: 'ACTIVE',
            description:
              'TEST ODOO UAT — Session 203238 confirmée. Date affichée : date technique du test, à remplacer par la date réelle de formation.',
          },
          include: { questions: true },
        });
      });
    }
    if (
      session &&
      (session.name !== config.sessionName ||
        session.trainer !== config.trainer ||
        !session.description.includes('TEST ODOO UAT'))
    ) {
      console.log(
        JSON.stringify(
          {
            existingSession: {
              id: session.id,
              name: session.name,
              trainer: session.trainer,
              date: session.date,
              questions: session.questions.map((q) => ({ label: q.label, type: q.type })),
              participants: await db.participant.count({ where: { sessionId: session.id } }),
              responses: await db.response.count({ where: { sessionId: session.id } }),
            },
          },
          null,
          2,
        ),
      );
      throw new OdooError('Une autre session 203238 existe déjà. Elle est conservée.');
    }
    if (!session)
      session = await db.trainingSession.create({
        data: {
          id: config.sourceSessionId,
          name: config.sessionName,
          trainer: config.trainer,
          date: new Date(new Date().toISOString().slice(0, 10)),
          status: 'ACTIVE',
          description:
            'TEST ODOO UAT — Session 203238 confirmée par l’administrateur. Date affichée : date technique de création du test, à remplacer par la date réelle de formation.',
          questions: { create: defaultQuestions.map((q, position) => ({ ...q, position })) },
        },
        include: { questions: true },
      });
    const token = generateToken();
    const participant = await db.participant.upsert({
      where: { sessionId_email: { sessionId: session.id, email: preview.participant.email } },
      update: {},
      create: {
        sessionId: session.id,
        ...preview.participant,
        tokenHash: hashToken(token),
        tokenEncrypted: encryptToken(token),
      },
    });
    if (
      participant.firstName !== preview.participant.firstName ||
      participant.lastName !== preview.participant.lastName
    )
      throw new OdooError('Le participant existant ne correspond pas au test technique.');
    console.log(
      'Session 203238 et participant fictif TEST ODOO TECHNIQUE prêts. Formulaire Odoo vérifié en lecture seule.',
    );
    if (!process.argv.includes('--send-test')) return;
    let response = await db.response.findUnique({ where: { participantId: participant.id } });
    if (!response) {
      const { submitResponse } = await import('../src/lib/submission');
      const answers: Answer[] = session.questions
        .filter((q) => q.active)
        .map((q) => {
          const index = defaultQuestions.findIndex(
            (standard) => standard.label === q.label && standard.type === q.type,
          );
          if (index < 0) throw new OdooError('Question de test différente du standard.');
          return {
            questionId: q.id,
            value: index < 11 ? 4 : suggestion,
            ...(index === 0 ? { comment: 'TEST TECHNIQUE — transmission du commentaire.' } : {}),
          };
        });
      const responseId = await submitResponse(
        { sessionId: session.id, token: decryptToken(participant.tokenEncrypted), answers },
        'odoo-test-local',
      );
      response = await db.response.findUniqueOrThrow({ where: { id: responseId } });
    }
    const { deliverOdoo, queueOdoo, odooStatus } = await import('../src/lib/odoo');
    await db.$transaction((tx) => queueOdoo(tx, session!.id, response!.id));
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const result = await nativeFetch(url, options);
      if (
        options?.method === 'POST' &&
        String(url) === 'https://odoo.uat.houseoftraining.lu/session/satisfaction'
      ) {
        const raw = await result.clone().text();
        const $ = load(raw);
        $('script,style,pre,form').remove();
        let text = ($('main').length ? $('main') : $('body'))
          .text()
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3000);
        text = text
          .replaceAll(new URL(config.url).pathname.split('/').at(-1)!, '[token masqué]')
          .replace(/[a-f\d]{64,}/gi, '[jeton masqué]');
        await mkdir('test-results', { recursive: true });
        let acknowledgement: unknown = null;
        try {
          const value = JSON.parse(raw);
          acknowledgement = {
            jsonrpc: value.jsonrpc,
            result: value.result,
            error: value.error
              ? { code: value.error.code, message: value.error.message }
              : undefined,
          };
        } catch {}
        await writeFile(
          'test-results/odoo-test-acknowledgement.json',
          JSON.stringify({ status: result.status, text, acknowledgement }, null, 2),
        );
      }
      return result;
    };
    try {
      await deliverOdoo(response.id);
    } finally {
      globalThis.fetch = nativeFetch;
    }
    const job = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: `odoo:${response.id}` },
    });
    console.log(
      JSON.stringify(
        {
          sessionId: session.id,
          responseId: response.id,
          state: (job.payload as { state: string }).state,
          confirmed: !!job.deliveredAt,
          status: await odooStatus(session.id),
        },
        null,
        2,
      ),
    );
    if (!job.deliveredAt) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof OdooError
      ? error.message
      : `Échec du test Odoo (${error instanceof Error ? error.name : 'erreur'}).`,
  );
  process.exitCode = 1;
});
