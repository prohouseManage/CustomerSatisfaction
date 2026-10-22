import { api, requireAdmin, readJson, ipHash } from '@/lib/security';
import { db } from '@/lib/db';
import { retentionSchema } from '@/lib/retention-policy';
import { retentionOverview } from '@/lib/retention';
export const GET = api(async (request) => {
  await requireAdmin(request);
  return Response.json(await retentionOverview());
});
export const PUT = api(async (request) => {
  const admin = await requireAdmin(request);
  const policy = retentionSchema.parse(await readJson(request));
  await db.$transaction(async (tx) => {
    await tx.retentionSettings.upsert({
      where: { id: 'retention' },
      create: { id: 'retention', ...policy },
      update: policy,
    });
    await tx.auditLog.create({
      data: {
        action: 'RETENTION_SETTINGS_UPDATED',
        actorId: admin.id,
        resourceId: 'retention',
        ipHash: ipHash(request.headers),
      },
    });
  });
  return Response.json(await retentionOverview());
});
