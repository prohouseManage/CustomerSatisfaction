import { api, requireAdmin, paginationPage } from '@/lib/security';
import { statistics } from '@/lib/reports';
import { parseReportFilters } from '@/lib/report-filters';
export const GET = api(async (request) => {
  await requireAdmin(request);
  const params = new URL(request.url).searchParams;
  return Response.json(
    await statistics(parseReportFilters(params), {
      summary: params.get('summary') === 'true',
      page: paginationPage(params),
    }),
  );
});
