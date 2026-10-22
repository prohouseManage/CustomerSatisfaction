import { api, requireAdmin } from '@/lib/security';
import { statistics } from '@/lib/reports';
export const GET = api(async (request) => {
  await requireAdmin(request);
  return Response.json(
    await statistics(new URL(request.url).searchParams.get('sessionId') || undefined),
  );
});
