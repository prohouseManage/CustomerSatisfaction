import { api, requireAdmin, rateLimit, ApiError } from '@/lib/security';
import { db } from '@/lib/db';
import { deliverWebhooks, powerAutomateConfigured } from '@/lib/webhooks';
import { powerAutomateOnly } from '@/lib/odoo';
export const maxDuration = 300;
export const GET = api(async (request) => {
  await requireAdmin(request);
  const [delivered, pending, failed] = await Promise.all([
    db.webhookDelivery.count({ where: { ...powerAutomateOnly, deliveredAt: { not: null } } }),
    db.webhookDelivery.count({ where: { ...powerAutomateOnly, deliveredAt: null } }),
    db.webhookDelivery.count({
      where: { ...powerAutomateOnly, deliveredAt: null, attempts: { gt: 0 } },
    }),
  ]);
  return Response.json({
    database: !!process.env.DATABASE_URL,
    encryption: /^[a-f\d]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY || ''),
    webhook: powerAutomateConfigured(),
    webhookSecret: !!process.env.POWER_AUTOMATE_WEBHOOK_SECRET,
    https: process.env.NEXTAUTH_URL?.startsWith('https://') || false,
    delivered,
    pending,
    failed,
  });
});
export const POST = api(async (request) => {
  const admin = await requireAdmin(request);
  await rateLimit(`retry:${admin.id}`, 5, 300);
  if (!powerAutomateConfigured())
    throw new ApiError(400, 'Configurez d’abord l’URL du flux Power Automate.');
  await db.webhookDelivery.updateMany({
    where: {
      ...powerAutomateOnly,
      deliveredAt: null,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
    },
    data: { nextAttemptAt: new Date() },
  });
  await deliverWebhooks();
  return Response.json({ ok: true });
});
