import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import ParticipantForm from '@/components/participant-form';
import { getOdooConfig } from '@/lib/odoo-config';
import { initialFormLanguage } from '@/lib/form-language';
import { headers } from 'next/headers';
export const dynamic = 'force-dynamic';
export default async function SessionPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const auth = await getServerSession(authOptions);
  if (!auth?.user?.email) redirect('/login');
  const admin = await db.admin.findUnique({ where: { email: auth.user.email } });
  if (!admin) redirect('/login');
  const { id } = await params;
  const session = await db.trainingSession.findUnique({
    where: { id },
    include: { questions: { where: { active: true }, orderBy: { position: 'asc' } } },
  });
  if (!session) notFound();
  return (
    <ParticipantForm
      initialLanguage={initialFormLanguage({
        requested: (await searchParams).lang,
        configured: session.formLanguage,
        acceptLanguage: (await headers()).get('accept-language'),
      })}
      demo
      token=""
      data={{
        sessionId: session.id,
        name: session.name,
        trainer: session.trainer,
        date: session.date.toISOString(),
        endDate: session.endDate?.toISOString(),
        firstName: 'Participant',
        lastName: 'Exemple',
        email: 'apercu@example.com',
        questions: session.questions,
        ratingCommentThreshold: (await getOdooConfig(session.id)) ? 2 : undefined,
      }}
    />
  );
}
