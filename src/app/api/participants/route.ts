import { api, requireAdmin, paginationPage } from '@/lib/security';
import { listParticipants, participantFiltersSchema } from '@/lib/participants';
export const GET = api(async (request) => {
  await requireAdmin(request);
  const params = new URL(request.url).searchParams;
  const sessionId = params.get('sessionId') || undefined;
  const page = paginationPage(params);
  const filters = participantFiltersSchema.parse({
    q: params.get('q') || '',
    status: params.get('status') || 'ALL',
  });
  return Response.json(await listParticipants(sessionId, page, filters));
});
