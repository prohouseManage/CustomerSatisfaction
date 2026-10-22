import { after } from 'next/server';
import { api, requireAdmin, rateLimit, ipHash } from '@/lib/security';
import { resendStaffInvitation, deliverStaffInvitation } from '@/lib/collaboration';
export const maxDuration = 60;
export const POST = api<{ id: string }>(async (request, context) => {
  const admin = await requireAdmin(request);
  await rateLimit(`collaboration:invite:${admin.id}`, 20, 3600);
  const invitation = await resendStaffInvitation(
    admin.id,
    (await context.params).id,
    ipHash(request.headers),
  );
  after(async () => {
    try {
      await deliverStaffInvitation(invitation.id);
    } catch {
      console.error('collaboration_delivery_deferred');
    }
  });
  return Response.json(invitation, { status: 202 });
});
