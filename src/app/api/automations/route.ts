import { api, requireAdmin } from '@/lib/security';
import { automationOverview } from '@/lib/automations';
export const GET = api(async (request) => {
  await requireAdmin(request);
  return Response.json(await automationOverview());
});
