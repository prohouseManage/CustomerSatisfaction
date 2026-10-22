import { z } from 'zod';
import { api, ApiError, readJson, rateLimit, ipHash, audit } from '@/lib/security';
import { secretMatches } from '@/lib/crypto';
import { db } from '@/lib/db';
const schema = z
  .object({
    eventId: z.string().uuid(),
    sessionId: z.string().min(3).max(50),
    participantId: z.string().uuid(),
    nom: z.string().max(100),
    prenom: z.string().max(100),
    email: z.string().email(),
    submittedAt: z.string().datetime(),
    answers: z
      .array(
        z.object({
          questionId: z.string().uuid(),
          comment: z.string().trim().max(2000).optional(),
          value: z.union([
            z.string().max(10000),
            z.number(),
            z.boolean(),
            z.array(z.string().max(200)),
          ]),
          label: z.string().max(500).optional(),
          type: z.string().max(50).optional(),
        }),
      )
      .max(50),
  })
  .strict();
export const POST = api(async (request) => {
  if (
    !secretMatches(
      request.headers.get('x-webhook-secret'),
      process.env.POWER_AUTOMATE_INBOUND_SECRET,
    )
  )
    throw new ApiError(401, 'Secret webhook invalide.');
  await rateLimit(`inbound:${ipHash(request.headers)}`, 60);
  const payload = schema.parse(await readJson(request));
  await db.integrationEvent.upsert({
    where: { id: payload.eventId },
    create: { id: payload.eventId, payload },
    update: {},
  });
  await audit(request, 'POWER_AUTOMATE_EVENT', undefined, payload.eventId);
  return Response.json({ received: true, eventId: payload.eventId });
});
