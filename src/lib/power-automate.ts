import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { Answer } from './validation';
import { rounded, ratingSummary, readableAnswers } from './satisfaction-metrics';

export async function sessionIntegrationData(tx: Prisma.TransactionClient, sessionId: string) {
  const session = await tx.trainingSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      questions: { select: { id: true, label: true, type: true } },
      responses: { select: { answers: true } },
      _count: { select: { participants: true } },
    },
  });
  const types = new Map(session.questions.map((q) => [q.id, q.type]));
  const score = ratingSummary(
    session.responses.flatMap((r) => r.answers as Answer[]),
    types,
  );
  return {
    session,
    types,
    data: {
      schemaVersion: 2 as const,
      metricsUpdatedAt: new Date().toISOString(),
      sessionId: session.id,
      sessionName: session.name,
      sessionDate: session.date.toISOString().slice(0, 10),
      trainer: session.trainer,
      sessionStatus: session.status,
      sessionVersion: session.integrationRevision,
      sessionParticipantCount: session._count.participants,
      sessionResponseCount: session.responses.length,
      sessionParticipationPercent: session._count.participants
        ? rounded((session.responses.length / session._count.participants) * 100)
        : 0,
      sessionAverageScore: score.score,
      sessionSatisfactionPercent: score.percent,
      sessionRatingCount: score.count,
      scoreScale: 4,
    },
  };
}
export async function responseIntegrationPayload(tx: Prisma.TransactionClient, responseId: string) {
  const response = await tx.response.findUniqueOrThrow({
    where: { id: responseId },
    include: { participant: true },
  });
  const { data, session, types } = await sessionIntegrationData(tx, response.sessionId);
  const answers = (response.answers as Answer[]).map((a) => {
    const question = session.questions.find((q) => q.id === a.questionId);
    return { ...a, label: question?.label || a.questionId, type: question?.type || 'UNKNOWN' };
  });
  const score = ratingSummary(answers, types);
  return {
    ...data,
    eventType: 'satisfaction.response' as const,
    eventId: response.id,
    participantId: response.participantId,
    nom: response.participant.lastName,
    prenom: response.participant.firstName,
    email: response.participant.email,
    submittedAt: response.submittedAt.toISOString(),
    participantScore: score.score,
    participantScorePercent: score.percent,
    participantRatingCount: score.count,
    answers,
    answersText: readableAnswers(answers),
  };
}
export async function sessionIntegrationPayload(
  tx: Prisma.TransactionClient,
  sessionId: string,
  eventId: string,
) {
  const { data } = await sessionIntegrationData(tx, sessionId);
  return { ...data, eventType: 'satisfaction.session' as const, eventId };
}
/** Refresh the session summary when its metadata or participant denominator changes. */
export async function queueSessionIntegration(tx: Prisma.TransactionClient, sessionId: string) {
  if (!(await tx.response.count({ where: { sessionId } }))) return;
  const eventId = randomUUID();
  const payload = await sessionIntegrationPayload(tx, sessionId, eventId);
  await tx.webhookDelivery.create({ data: { id: eventId, payload } });
  return eventId;
}
