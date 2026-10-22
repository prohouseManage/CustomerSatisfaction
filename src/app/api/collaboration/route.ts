import { after } from 'next/server';
import { api, requireAdmin, rateLimit, readJson, ipHash, paginationPage } from '@/lib/security';
import {
  collaborationOverview,
  createStaffInvitation,
  deliverStaffInvitation,
} from '@/lib/collaboration';
export const maxDuration = 60;
export const GET = api(async (request) => {
  const admin = await requireAdmin(request);
  return Response.json({
    ...(await collaborationOverview(paginationPage(new URL(request.url).searchParams))),
    currentMemberId: admin.id,
  });
});
export const POST = api(async (request) => {
  const admin = await requireAdmin(request);
  await rateLimit(`collaboration:invite:${admin.id}`, 20, 3600);
  const invitation = await createStaffInvitation(
    admin.id,
    await readJson(request, 4096),
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
