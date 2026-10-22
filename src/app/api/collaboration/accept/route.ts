import { api, assertOrigin, rateLimit, ipHash, readJson } from '@/lib/security';
import { hashToken } from '@/lib/crypto';
import { acceptStaffInvitation } from '@/lib/collaboration';
import { acceptInvitationSchema } from '@/lib/staff-policy';
export const POST = api(async (request) => {
  assertOrigin(request);
  const hashedIp = ipHash(request.headers);
  await rateLimit(`invitation:accept:ip:${hashedIp}`, 30, 900);
  const input = acceptInvitationSchema.parse(await readJson(request, 4096));
  await rateLimit(`invitation:accept:token:${hashToken(input.token)}`, 10, 900);
  await acceptStaffInvitation(input, hashedIp);
  return Response.json(
    { message: 'Votre compte est activé. Vous pouvez vous connecter.' },
    { status: 201 },
  );
});
