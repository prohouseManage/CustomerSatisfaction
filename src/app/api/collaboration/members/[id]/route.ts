import { api, requireAdmin, readJson, ipHash } from '@/lib/security';
import { updateStaffMember } from '@/lib/collaboration';
export const PATCH = api<{ id: string }>(async (request, context) => {
  const admin = await requireAdmin(request);
  return Response.json(
    await updateStaffMember(
      admin.id,
      (await context.params).id,
      await readJson(request, 4096),
      ipHash(request.headers),
    ),
  );
});
