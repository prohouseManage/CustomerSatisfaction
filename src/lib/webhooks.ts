import { db } from './db';
import { lockSession } from './sessions';
import { responseIntegrationPayload, sessionIntegrationPayload } from './power-automate';
import { powerAutomateOnly } from './odoo';
export function powerAutomateConfigured() {
  try {
    return (
      !!process.env.POWER_AUTOMATE_WEBHOOK_URL &&
      new URL(process.env.POWER_AUTOMATE_WEBHOOK_URL).protocol === 'https:'
    );
  } catch {
    return false;
  }
}
export async function deliverWebhooks(
  eventId?: string,
  budget?: { limit: number; deadline: number },
) {
  const url = process.env.POWER_AUTOMATE_WEBHOOK_URL;
  if (!url || !powerAutomateConfigured()) return;
  const now = new Date();
  const deliveries = await db.webhookDelivery.findMany({
    where: {
      ...powerAutomateOnly,
      id: eventId,
      deliveredAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    take: budget?.limit || 5,
    orderBy: { createdAt: 'asc' },
  });
  for (const delivery of deliveries) {
    if (budget && Date.now() + 50000 >= budget.deadline) break;
    const claim = await db.webhookDelivery.updateMany({
      where: {
        id: delivery.id,
        deliveredAt: null,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil: new Date(Date.now() + 120_000), attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    try {
      // Also enrich events queued before the Power Automate connection was configured.
      const payload = await db.$transaction(async (tx) => {
        const previous = delivery.payload as { sessionId: string; eventType?: string };
        await lockSession(tx, previous.sessionId);
        const enriched =
          previous.eventType === 'satisfaction.session'
            ? await sessionIntegrationPayload(tx, previous.sessionId, delivery.id)
            : await responseIntegrationPayload(tx, delivery.id);
        await tx.webhookDelivery.update({
          where: { id: delivery.id },
          data: { payload: enriched },
        });
        return enriched;
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': delivery.id,
          ...(process.env.POWER_AUTOMATE_WEBHOOK_SECRET
            ? { 'x-webhook-secret': process.env.POWER_AUTOMATE_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const acknowledgement = await response.json().catch(() => null);
      if (
        response.status !== 200 ||
        acknowledgement?.received !== true ||
        acknowledgement.eventId !== delivery.id
      )
        throw new Error('Accusé de réception Power Automate invalide');
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { deliveredAt: new Date(), lockedUntil: null, lastError: null },
      });
    } catch (error) {
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          lockedUntil: null,
          lastError:
            error instanceof Error &&
            /^(HTTP \d+|Accusé de réception Power Automate invalide)$/.test(error.message)
              ? error.message
              : 'Erreur réseau ou délai dépassé',
          nextAttemptAt: new Date(
            Date.now() + Math.min(86_400, 60 * 2 ** Math.min(delivery.attempts, 10)) * 1000,
          ),
        },
      });
    }
  }
}
