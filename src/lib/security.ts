import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { db, configured } from './db';
import { baseUrl, hashToken } from './crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function paginationPage(params: URLSearchParams) {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .parse(params.get('page') || '1');
}
export function ipHash(headers: Headers) {
  // On Vercel, use the platform-controlled header, never the client-supplied first forwarded IP.
  const ip = process.env.VERCEL
    ? headers.get('x-vercel-forwarded-for')
    : headers.get('x-forwarded-for');
  return hashToken(
    `${process.env.NEXTAUTH_SECRET || 'local'}:${ip?.split(',')[0]?.trim() || 'local'}`,
  );
}
export async function rateLimit(key: string, max = 60, windowSeconds = 60) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt") VALUES (${key}, 1, NOW() + ${windowSeconds} * INTERVAL '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."expiresAt" <= NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= NOW() THEN NOW() + ${windowSeconds} * INTERVAL '1 second' ELSE "RateLimit"."expiresAt" END
    RETURNING "count"`;
  if (rows[0].count > max)
    throw new ApiError(429, 'Trop de tentatives. Veuillez patienter avant de réessayer.');
}
export function assertOrigin(request: Request) {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers.get('origin') !== baseUrl()
  )
    throw new ApiError(403, 'Origine de la requête refusée.');
}
export async function requireAdmin(request: Request) {
  if (!configured()) throw new ApiError(503, 'La connexion PostgreSQL doit être configurée.');
  assertOrigin(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new ApiError(401, 'Authentification requise.');
  const admin = await db.admin.findUnique({ where: { email: session.user.email } });
  if (!admin) throw new ApiError(403, 'Compte administrateur requis.');
  await rateLimit(`admin:${admin.id}`, 120);
  await audit(request, `${request.method} ${new URL(request.url).pathname}`, admin.id);
  return admin;
}
export async function audit(
  request: Request,
  action: string,
  actorId?: string,
  resourceId?: string,
) {
  await db.auditLog.create({
    data: { action, actorId, resourceId, ipHash: ipHash(request.headers) },
  });
}
export async function readJson(request: Request, maxBytes = 128_000) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(415, 'JSON requis.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Corps manquant.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'Requête trop volumineuse.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new ApiError(400, 'JSON invalide.');
  }
}
export function api<P extends Record<string, string> = Record<string, never>>(
  handler: (request: Request, context: { params: Promise<P> }) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    const requestId = crypto.randomUUID();
    try {
      const response = await handler(request, context);
      response.headers.set('X-Request-ID', requestId);
      return response;
    } catch (error) {
      if (error instanceof ApiError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers: error.status === 429 ? { 'Retry-After': '60' } : {} },
        );
      if (error instanceof z.ZodError)
        return Response.json(
          { error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
          { status: 400 },
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return Response.json(
          { error: 'Cet identifiant ou cet e-mail existe déjà.' },
          { status: 409 },
        );
      // No URL query, body, database error message, e-mail address or token is logged.
      console.error(
        JSON.stringify({
          event: 'api_error',
          requestId,
          method: request.method,
          route: new URL(request.url).pathname.replace(
            /\/form\/[^/]+\/[^/]+/,
            '/form/[session]/[token]',
          ),
          type: error instanceof Error ? error.name : 'UnknownError',
          ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
        }),
      );
      return Response.json(
        {
          error: 'Service temporairement indisponible. Vérifiez la configuration ou réessayez.',
          requestId,
        },
        { status: 503, headers: { 'X-Request-ID': requestId } },
      );
    }
  };
}
