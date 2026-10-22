import { db } from './db';
import type { EmailHistoryItem } from './email-tracking';
export const emailHistorySelect = {
  id: true,
  status: true,
  automaticKey: true,
  createdAt: true,
  sentAt: true,
  notBefore: true,
  lastError: true,
} as const;
export function emailHistoryItem(row: {
  id: string;
  status: string;
  automaticKey: string | null;
  createdAt: Date;
  sentAt: Date | null;
  notBefore: Date | null;
  lastError: string | null;
}): EmailHistoryItem {
  return {
    id: row.id,
    status: row.status,
    kind: row.automaticKey ? 'AUTOMATIC' : 'MANUAL',
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() || null,
    notBefore: row.notBefore?.toISOString().slice(0, 10) || null,
    lastError: row.lastError,
  };
}
export async function listParticipants(sessionId: string | undefined, page: number) {
  const where = { sessionId };
  const [items, total] = await Promise.all([
    db.participant.findMany({
      where,
      select: {
        id: true,
        sessionId: true,
        firstName: true,
        lastName: true,
        email: true,
        submittedAt: true,
        createdAt: true,
        session: { select: { name: true } },
        emailDeliveries: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: emailHistorySelect,
        },
      },
      orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
      take: 100,
      skip: (page - 1) * 100,
    }),
    db.participant.count({ where }),
  ]);
  const confirmed = items.length
    ? await db.emailDelivery.groupBy({
        by: ['participantId'],
        where: { participantId: { in: items.map((p) => p.id) }, status: 'SENT' },
        _max: { sentAt: true },
        _count: true,
      })
    : [];
  const byParticipant = new Map(confirmed.map((row) => [row.participantId, row]));
  return {
    items: items.map(({ emailDeliveries, ...p }) => {
      const sent = byParticipant.get(p.id);
      return {
        ...p,
        emailSummary: {
          sentCount: sent?._count || 0,
          lastSentAt: sent?._max.sentAt?.toISOString() || null,
          latest: emailDeliveries[0] ? emailHistoryItem(emailDeliveries[0]) : null,
        },
      };
    }),
    total,
    page,
    pageSize: 100,
  };
}
