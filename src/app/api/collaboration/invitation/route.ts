import { z } from 'zod';
import { api, assertOrigin, rateLimit, ipHash, readJson } from '@/lib/security';
import { hashToken } from '@/lib/crypto';
import { previewStaffInvitation } from '@/lib/collaboration';
export const POST = api(async (request) => {
  assertOrigin(request);
  await rateLimit(`invitation:preview:ip:${ipHash(request.headers)}`, 60, 900);
  const input = z
    .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .strict()
    .parse(await readJson(request, 4096));
  await rateLimit(`invitation:preview:token:${hashToken(input.token)}`, 30, 900);
  return Response.json(await previewStaffInvitation(input.token));
});
