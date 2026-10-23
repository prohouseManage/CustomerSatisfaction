import { db } from './db';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { EmailHistoryItem } from './email-tracking';
export const participantFiltersSchema = z.object({
  q: z.string().trim().max(200).default(''),
  status: z.enum(['ALL', 'DONE', 'PENDING']).default('ALL'),
});
export const emailHistorySelect = {
  id: true,
  status: true,
  automaticKey: true,
  createdAt: true,
  sentAt: true,
  notBefore: true,
  lastError: true,
  providerStatus: true,
  providerUpdatedAt: true,
  deliveredAt: true,
  rejectedAt: true,
} as const;
export function emailHistoryItem(row: {
  id: string;
  status: string;
  automaticKey: string | null;
  createdAt: Date;
  sentAt: Date | null;
  notBefore: Date | null;
  lastError: string | null;
  providerStatus?: string | null;
  providerUpdatedAt?: Date | null;
  deliveredAt?: Date | null;
  rejectedAt?: Date | null;
}): EmailHistoryItem {
  return {
    id: row.id,
    status: row.status,
    kind: row.automaticKey ? 'AUTOMATIC' : 'MANUAL',
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() || null,
    notBefore: row.notBefore?.toISOString().slice(0, 10) || null,
    lastError: row.lastError,
    providerStatus: row.providerStatus || null,
    providerUpdatedAt: row.providerUpdatedAt?.toISOString() || null,
    deliveredAt: row.deliveredAt?.toISOString() || null,
    rejectedAt: row.rejectedAt?.toISOString() || null,
  };
}
export async function listParticipants(
  sessionId: string | undefined,
  page: number,
  filters: { q?: string; status?: 'ALL' | 'DONE' | 'PENDING' } = {},
) {
  const { q, status } = participantFiltersSchema.parse(filters);
  const where: Prisma.ParticipantWhereInput = {
    sessionId,
    ...(status === 'DONE'
      ? { submittedAt: { not: null } }
      : status === 'PENDING'
        ? { submittedAt: null }
        : {}),
    ...(q
      ? {
          AND: q.split(/\s+/).map((word) => ({
            OR: [
              { firstName: { contains: word, mode: 'insensitive' as const } },
              { lastName: { contains: word, mode: 'insensitive' as const } },
              { email: { contains: word, mode: 'insensitive' as const } },
            ],
          })),
        }
      : {}),
  };
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
        session: { select: { id: true, name: true, date: true, endDate: true, trainer: true } },
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
        where: {
          participantId: { in: items.map((p) => p.id) },
          OR: [{ status: 'SENT' }, { providerStatus: { not: null } }],
        },
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
