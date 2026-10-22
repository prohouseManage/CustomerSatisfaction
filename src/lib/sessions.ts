import { Prisma } from '@prisma/client';
import { ApiError } from './security';
import { db } from './db';
export async function lockSession(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "TrainingSession" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new ApiError(404, 'Session introuvable.');
  return tx.trainingSession.findUniqueOrThrow({
    where: { id },
    include: {
      questions: { where: { active: true }, orderBy: { position: 'asc' } },
      _count: { select: { participants: true, responses: true } },
    },
  });
}
export const sessionInclude = {
  emailSchedule: { select: { mode: true, delayDays: true, suspended: true, resumeOn: true } },
  questions: { where: { active: true }, orderBy: { position: 'asc' as const } },
  _count: { select: { participants: true, responses: true } },
};
export async function listSessions() {
  return db.trainingSession.findMany({ orderBy: { date: 'desc' }, include: sessionInclude });
}
