import { api, requireStaff, ipHash, readJson } from '@/lib/security';
import { collectionActionSchema, changeCollection } from '@/lib/collection';

export const POST = api<{ id: string }>(async (request, context) => {
  const staff = await requireStaff(request);
  const { action } = collectionActionSchema.parse(await readJson(request, 1024));
  const { id } = await context.params;
  return Response.json(
    await changeCollection(id, action, { id: staff.id, ipHash: ipHash(request.headers) }),
  );
});
