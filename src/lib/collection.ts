import { z } from 'zod';
import { db } from './db';
import { lockSession, sessionInclude } from './sessions';
import { ApiError } from './security';
import { deadlinePassed } from './response-window';

export const collectionActionSchema = z.object({ action: z.enum(['CLOSE', 'REOPEN']) }).strict();

export async function changeCollection(
  sessionId: string,
  action: 'CLOSE' | 'REOPEN',
  actor: { id: string; ipHash: string },
) {
  return db.$transaction(async (tx) => {
    const current = await lockSession(tx, sessionId);
    if (current.status !== 'ACTIVE')
      throw new ApiError(409, 'Activez la session avant de modifier la collecte des réponses.');
    const expired = deadlinePassed(current.responseDeadline);
    const changed =
      action === 'CLOSE'
        ? !current.responsesClosedAt
        : Boolean(current.responsesClosedAt || expired);
    if (changed) {
      await tx.trainingSession.update({
        where: { id: sessionId },
        data: {
          responsesClosedAt: action === 'CLOSE' ? new Date() : null,
          ...(action === 'REOPEN' && expired && { responseDeadline: null }),
          // Invalidate a pending email claim made before this collection change.
          integrationRevision: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          action: action === 'CLOSE' ? 'SESSION_RESPONSES_CLOSED' : 'SESSION_RESPONSES_REOPENED',
          actorId: actor.id,
          resourceId: sessionId,
          ipHash: actor.ipHash,
        },
      });
    }
    return tx.trainingSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: sessionInclude,
    });
  });
}
