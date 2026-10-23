import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { ApiError } from './security';

const eventSchema = z.object({
  signature: z.object({
    timestamp: z.string().regex(/^\d{10,12}$/),
    token: z.string().regex(/^[a-zA-Z0-9]{50}$/),
    signature: z.string().regex(/^[a-f0-9]{64}$/i),
  }),
  'event-data': z.object({
    id: z.string().min(1).max(200),
    event: z.string().max(50),
    severity: z.string().max(30).optional(),
    timestamp: z.number().finite().positive(),
    recipient: z.string().email().max(254),
    message: z.object({ headers: z.object({ 'message-id': z.string().min(3).max(500) }) }),
  }),
});

export type ProviderStatus = 'ACCEPTED' | 'DELIVERED' | 'DEFERRED' | 'REJECTED';
export function providerEventKind(event: string, severity?: string): ProviderStatus | null {
  if (event === 'accepted') return 'ACCEPTED';
  if (event === 'delivered') return 'DELIVERED';
  if (event === 'temporary_fail' || (event === 'failed' && severity === 'temporary'))
    return 'DEFERRED';
  if (event === 'permanent_fail' || (event === 'failed' && severity === 'permanent'))
    return 'REJECTED';
  return null;
}

export function verifyMailgunSignature(
  signature: { timestamp: string; token: string; signature: string },
  key: string,
  now = new Date(),
) {
  // Mailgun retries for several hours. Event IDs are also persisted to deduplicate replays.
  const seconds = now.getTime() / 1000 - Number(signature.timestamp);
  if (!key || !Number.isFinite(seconds) || seconds < -300 || seconds > 86400) return false;
  const expected = createHmac('sha256', key)
    .update(signature.timestamp + signature.token)
    .digest();
  const received = Buffer.from(signature.signature, 'hex');
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export async function receiveMailgunEvent(payload: unknown, now = new Date()) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) throw new ApiError(503, 'Suivi Mailgun non configuré.');
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(400, 'Événement Mailgun invalide.');
  if (!verifyMailgunSignature(parsed.data.signature, key, now))
    throw new ApiError(401, 'Signature Mailgun invalide.');
  const event = parsed.data['event-data'];
  const kind = providerEventKind(event.event, event.severity);
  if (!kind) return { received: true, ignored: true };
  const occurredAt = new Date(event.timestamp * 1000);
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > now.getTime() + 300_000)
    throw new ApiError(400, 'Date d’événement invalide.');
  const messageId = event.message.headers['message-id'].replace(/^<|>$/g, '');
  // Do not persist addresses, message contents, URLs, signatures or tokens from the webhook.
  const delivery = await db.emailDelivery.findUnique({
    where: { providerMessageId: messageId },
    select: { id: true, participant: { select: { email: true } } },
  });
  if (!delivery || delivery.participant.email.toLowerCase() !== event.recipient.toLowerCase())
    return { received: true, ignored: true };
  const eventId = createHash('sha256').update(`${messageId}:${event.id}`).digest('hex');
  return db.$transaction(async (tx) => {
    // Serialize against simultaneous provider events; the SMTP acknowledgement only changes status.
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "EmailDelivery" WHERE id=${delivery.id} FOR UPDATE`;
    if (!rows.length) return { received: true, ignored: true };
    const inserted = await tx.emailDeliveryEvent.createMany({
      data: [{ id: eventId, deliveryId: delivery.id, kind, occurredAt }],
      skipDuplicates: true,
    });
    if (!inserted.count) return { received: true, duplicate: true };
    const current = await tx.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    // An authenticated provider event resolves a lost SMTP acknowledgement, without a resend.
    if (['SENDING', 'UNKNOWN'].includes(current.status)) {
      await tx.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          sentAt: current.sentAt || occurredAt,
          lockedUntil: null,
          lastError: null,
        },
      });
    }
    const terminal = ['DELIVERED', 'REJECTED'].includes(current.providerStatus || '');
    const incomingTerminal = ['DELIVERED', 'REJECTED'].includes(kind);
    const newer = !current.providerUpdatedAt || occurredAt >= current.providerUpdatedAt;
    if ((!terminal && (newer || incomingTerminal)) || (terminal && incomingTerminal && newer)) {
      await tx.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          providerStatus: kind,
          providerUpdatedAt: occurredAt,
          ...(kind === 'DELIVERED' && { deliveredAt: occurredAt }),
          ...(kind === 'REJECTED' && { rejectedAt: occurredAt }),
        },
      });
    }
    return { received: true };
  });
}
