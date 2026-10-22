import { after } from 'next/server';
import { api, ApiError, assertOrigin, ipHash, rateLimit, readJson } from '@/lib/security';
import { configured } from '@/lib/db';
import { submitSchema } from '@/lib/validation';
import { submitResponse } from '@/lib/submission';
import { deliverWebhooks } from '@/lib/webhooks';
import { deliverOdoo } from '@/lib/odoo';
export const maxDuration = 60;
export const POST = api(async (request) => {
  assertOrigin(request);
  if (!configured()) throw new ApiError(503, 'Base de données non configurée.');
  const hashedIp = ipHash(request.headers);
  await rateLimit(`submit:${hashedIp}`, 30, 300);
  const input = submitSchema.parse(await readJson(request));
  const id = await submitResponse(input, hashedIp);
  after(async () => {
    try {
      await Promise.all([deliverWebhooks(id), deliverOdoo(id)]);
    } catch {
      console.error('webhook_delivery_deferred');
    }
  });
  return Response.json(
    { id, message: 'Merci ! Votre réponse a été enregistrée.' },
    { status: 201 },
  );
});
