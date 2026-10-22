import { Prisma } from '@prisma/client';
import { db } from './db';
import { hashToken } from './crypto';
import { lockSession } from './sessions';
import { ApiError } from './security';
import { validateAnswers, type Answer } from './validation';
import { responseIntegrationPayload } from './power-automate';
import { queueOdoo } from './odoo';
import { getOdooConfig } from './odoo-config';
export async function submitResponse(
  input: { sessionId: string; token: string; answers: Answer[]; language?: 'fr' | 'de' | 'en' },
  ipHash: string,
) {
  return db.$transaction(
    async (tx) => {
      const session = await lockSession(tx, input.sessionId);
      const participant = await tx.participant.findUnique({
        where: { tokenHash: hashToken(input.token) },
      });
      if (!participant || participant.sessionId !== input.sessionId)
        throw new ApiError(404, 'Lien invalide.');
      if (participant.submittedAt) throw new ApiError(409, 'Ce questionnaire a déjà été complété.');
      if (session.status !== 'ACTIVE')
        throw new ApiError(410, 'Ce questionnaire n’est pas ouvert aux réponses.');
      if (
        input.answers.some(
          (answer) => !session.questions.some((question) => question.id === answer.questionId),
        )
      )
        throw new ApiError(
          400,
          'Le questionnaire a été mis à jour. Actualisez la page avant de répondre.',
        );
      let answers: Answer[];
      try {
        answers = validateAnswers(session.questions, input.answers);
      } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : 'Réponses invalides.');
      }
      if (await getOdooConfig(input.sessionId, tx)) {
        const missingComment = answers.find(
          (answer) =>
            session.questions.some((q) => q.id === answer.questionId && q.type === 'RATING_4') &&
            typeof answer.value === 'number' &&
            answer.value <= 2 &&
            !answer.comment?.trim(),
        );
        if (missingComment)
          throw new ApiError(400, 'Un commentaire est requis pour une note de 1 ou 2 étoiles.');
      }
      const submittedAt = new Date();
      const claimed = await tx.participant.updateMany({
        where: { id: participant.id, submittedAt: null },
        data: { submittedAt },
      });
      if (claimed.count !== 1) throw new ApiError(409, 'Ce questionnaire a déjà été complété.');
      const response = await tx.response.create({
        data: {
          sessionId: input.sessionId,
          participantId: participant.id,
          submittedAt,
          answers: answers as Prisma.InputJsonValue,
          language: input.language || 'fr',
        },
      });
      await tx.trainingSession.update({
        where: { id: session.id },
        data: { integrationRevision: { increment: 1 } },
      });
      const payload = await responseIntegrationPayload(tx, response.id);
      await tx.webhookDelivery.create({ data: { id: response.id, payload } });
      await queueOdoo(tx, input.sessionId, response.id);
      await tx.auditLog.create({
        data: { action: 'SUBMIT_SUCCESS', resourceId: participant.id, ipHash },
      });
      return response.id;
    },
    { timeout: 15000 },
  );
}
