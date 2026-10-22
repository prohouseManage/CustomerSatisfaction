import { api, requireAdmin, paginationPage } from '@/lib/security';
import { listParticipants } from '@/lib/participants';
export const GET = api(async (request) => {
  await requireAdmin(request);
  const params = new URL(request.url).searchParams;
  const sessionId = params.get('sessionId') || undefined;
  const page = paginationPage(params);
  return Response.json(await listParticipants(sessionId, page));
});
