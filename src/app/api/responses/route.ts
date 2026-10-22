import { api, requireStaff, paginationPage } from '@/lib/security';
import { db } from '@/lib/db';
import { parseReportFilters, reportSessionWhere } from '@/lib/report-filters';
export const GET = api(async (request) => {
  await requireStaff(request);
  const params = new URL(request.url).searchParams;
  const page = paginationPage(params);
  const where = { session: reportSessionWhere(parseReportFilters(params)) };
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
