import { api, ApiError, requireStaff, paginationPage } from '@/lib/security';
import { db } from '@/lib/db';
import { emailHistorySelect, emailHistoryItem } from '@/lib/participants';
export const GET = api<{ id: string }>(async (request, context) => {
  await requireStaff(request);
  const { id } = await context.params;
  const participant = await db.participant.findUnique({
    where: { id },
    select: { id: true, sessionId: true, firstName: true, lastName: true, email: true },
  });
  if (!participant) throw new ApiError(404, 'Participant introuvable.');
  const page = paginationPage(new URL(request.url).searchParams);
  const where = { participantId: id };
  const [items, total] = await Promise.all([
    db.emailDelivery.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: emailHistorySelect,
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.emailDelivery.count({ where }),
  ]);
  return Response.json({
    participant,
    items: items.map(emailHistoryItem),
    total,
    page,
    pageSize: 20,
  });
});
