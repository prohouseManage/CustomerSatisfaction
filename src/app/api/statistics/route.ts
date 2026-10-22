import { api, requireAdmin } from '@/lib/security';
import { statistics } from '@/lib/reports';
import { parseReportFilters } from '@/lib/report-filters';
export const GET = api(async (request) => {
  await requireAdmin(request);
  return Response.json(await statistics(parseReportFilters(new URL(request.url).searchParams)));
});
