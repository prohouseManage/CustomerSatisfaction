import { headers } from 'next/headers';
import { db, configured } from '@/lib/db';
import { hashToken } from '@/lib/crypto';
import { ApiError, ipHash, rateLimit } from '@/lib/security';
import ParticipantForm, {
  ParticipantStatus,
  type FormDataView,
} from '@/components/participant-form';
import { initialFormLanguage } from '@/lib/form-language';
import { getOdooConfig } from '@/lib/odoo-config';
export const dynamic = 'force-dynamic';
export default async function ParticipantPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string; token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { sessionId, token } = await params;
  const requested = (await searchParams).lang;
  const requestHeaders = await headers();
  let language = initialFormLanguage({ requested });
  if (!configured() || !/^[A-Za-z0-9_-]{43}$/.test(token))
    return <ParticipantStatus kind="unavailable" initialLanguage={language} />;
  let data: FormDataView | undefined,
    completed = false,
    closed = false,
    failed = false,
    limited = false;
  try {
    const hashedIp = ipHash(requestHeaders);
    await rateLimit(`form:${hashedIp}`, 90, 300);
    const p = await db.participant.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        session: {
          include: { questions: { where: { active: true }, orderBy: { position: 'asc' } } },
        },
      },
    });
    await db.auditLog.create({
      data: {
        action: p && p.sessionId === sessionId ? 'FORM_ACCESS' : 'FORM_INVALID_LINK',
        resourceId: p && p.sessionId === sessionId ? p.id : undefined,
        ipHash: hashedIp,
      },
    });
    if (p && p.sessionId === sessionId) {
      language = initialFormLanguage({
        requested,
        configured: p.session.formLanguage,
        acceptLanguage: requestHeaders.get('accept-language'),
      });
      completed = !!p.submittedAt;
      closed = p.session.status !== 'ACTIVE';
      if (!completed && !closed)
        data = {
          sessionId,
          name: p.session.name,
          trainer: p.session.trainer,
          date: p.session.date.toISOString(),
          endDate: p.session.endDate?.toISOString(),
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          questions: p.session.questions,
          ratingCommentThreshold: (await getOdooConfig(sessionId)) ? 2 : undefined,
        };
    }
  } catch (error) {
    limited = error instanceof ApiError && error.status === 429;
    failed = true;
  }
  if (completed) return <ParticipantStatus kind="completed" initialLanguage={language} />;
  if (closed) return <ParticipantStatus kind="closed" initialLanguage={language} />;
  if (!data)
    return (
      <ParticipantStatus
        kind={limited ? 'limited' : failed ? 'failed' : 'unavailable'}
        initialLanguage={language}
      />
    );
  return <ParticipantForm data={data} token={token} initialLanguage={language} />;
}
