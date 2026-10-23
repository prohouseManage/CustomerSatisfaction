import { api, ipHash, rateLimit, readJson } from '@/lib/security';
import { receiveMailgunEvent } from '@/lib/mailgun-events';

export const POST = api(async (request) => {
  await rateLimit(`mailgun:${ipHash(request.headers)}`, 3000, 60);
  return Response.json(await receiveMailgunEvent(await readJson(request, 64_000)));
});
