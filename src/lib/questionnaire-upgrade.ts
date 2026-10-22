import type { PrismaClient } from '@prisma/client';
import { defaultQuestions, legacyDefaultQuestions, type QuestionInput } from './validation';
import { lockSession } from './sessions';

export function isLegacyDefaultQuestionnaire(questions: Omit<QuestionInput, 'translations'>[]) {
  const clean = questions.map(({ label, type, required, options }) => ({
    label,
    type,
    required,
    options,
  }));
  return JSON.stringify(clean) === JSON.stringify(legacyDefaultQuestions);
}

export async function upgradeStandardQuestionnaires(db: PrismaClient, apply = false) {
  const sessions = await db.trainingSession.findMany({
    include: {
      questions: { where: { active: true }, orderBy: { position: 'asc' } },
      _count: { select: { participants: true, responses: true } },
    },
  });
  const candidates = sessions.filter((session) => isLegacyDefaultQuestionnaire(session.questions));
  const result = [];
  for (const candidate of candidates) {
    if (!apply) {
      result.push({ id: candidate.id, ...candidate._count, updated: false });
      continue;
    }
    const update = await db.$transaction(async (tx) => {
      const current = await lockSession(tx, candidate.id);
      if (!isLegacyDefaultQuestionnaire(current.questions)) return null;
      const highest = await tx.question.aggregate({
        where: { sessionId: current.id },
        _max: { position: true },
      });
      await tx.question.updateMany({
        where: { sessionId: current.id, active: true },
        data: { active: false },
      });
      await tx.question.createMany({
        data: defaultQuestions.map((question, index) => ({
          ...question,
          sessionId: current.id,
          position: (highest._max.position ?? -1) + 1 + index,
        })),
      });
      return { id: current.id, ...current._count, updated: true };
    });
    if (update) result.push(update);
  }
  return result;
}
