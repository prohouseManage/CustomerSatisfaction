import { api, requireStaff } from '@/lib/security';
import { automationOverview } from '@/lib/automations';
export const GET = api(async (request) => {
  await requireStaff(request);
  return Response.json(await automationOverview());
});
