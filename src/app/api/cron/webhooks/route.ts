import { api, ApiError } from '@/lib/security';
import { secretMatches } from '@/lib/crypto';
import { runAutomations } from '@/lib/automations';
export const maxDuration = 300;
export const GET = api(async (request) => {
  if (
    !secretMatches(
      request.headers.get('authorization'),
      process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined,
    )
  )
    throw new ApiError(401, 'Accès refusé.');
  const result = await runAutomations();
  return Response.json(result, { status: result.skipped ? 202 : result.ok ? 200 : 503 });
});
