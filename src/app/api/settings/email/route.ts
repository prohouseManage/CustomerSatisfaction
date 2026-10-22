import { api, requireAdmin, requireStaff, readJson, ipHash } from '@/lib/security';
import { db } from '@/lib/db';
import { emailSettingsSchema } from '@/lib/email-policy';
import { getEmailPolicy, emailServiceStatus } from '@/lib/emails';
export const GET = api(async (request) => {
  await requireStaff(request);
  return Response.json({ ...(await getEmailPolicy()), ...emailServiceStatus() });
});
export const PUT = api(async (request) => {
  const admin = await requireAdmin(request);
  const policy = emailSettingsSchema.parse(await readJson(request));
  await db.$transaction(async (tx) => {
    await tx.emailSettings.upsert({
      where: { id: 'email' },
      create: { id: 'email', ...policy },
      update: policy,
    });
    await tx.auditLog.create({
      data: {
        action: 'EMAIL_SETTINGS_UPDATED',
        actorId: admin.id,
        resourceId: 'email',
        ipHash: ipHash(request.headers),
      },
    });
  });
  return Response.json({ ...policy, ...emailServiceStatus() });
});
