import { api, requireAdmin, paginationPage } from '@/lib/security';
import { db } from '@/lib/db';
export const GET = api(async (request) => {
  await requireAdmin(request);
  const params = new URL(request.url).searchParams;
  const sessionId = params.get('sessionId') || undefined,
    page = paginationPage(params);
  const where = { sessionId };
  const [items, total] = await Promise.all([
    db.response.findMany({
      where,
      include: {
        participant: { select: { id: true, firstName: true, lastName: true, email: true } },
        session: { select: { name: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 100,
      skip: (page - 1) * 100,
    }),
    db.response.count({ where }),
  ]);
  return Response.json({ items, total, page, pageSize: 100 });
});
