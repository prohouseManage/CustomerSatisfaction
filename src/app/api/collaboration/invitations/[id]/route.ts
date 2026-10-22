import { api, requireAdmin, ipHash } from '@/lib/security';
import { revokeStaffInvitation } from '@/lib/collaboration';
export const DELETE = api<{ id: string }>(async (request, context) => {
  const admin = await requireAdmin(request);
  await revokeStaffInvitation(admin.id, (await context.params).id, ipHash(request.headers));
  return new Response(null, { status: 204 });
});
