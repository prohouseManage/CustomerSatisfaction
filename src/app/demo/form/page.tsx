import { notFound } from 'next/navigation';
import { demoAllowed, demoSessions } from '@/lib/demo';
import ParticipantForm from '@/components/participant-form';
import { languageCode } from '@/lib/question-i18n';
export const dynamic = 'force-dynamic';
export default async function DemoForm({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  if (!demoAllowed()) notFound();
  const s = demoSessions[0];
  return (
    <ParticipantForm
      initialLanguage={languageCode((await searchParams).lang)}
      demo
      token=""
      data={{
        sessionId: s.id,
        name: s.name,
        trainer: s.trainer,
        date: s.date,
        endDate: s.endDate,
        firstName: 'Jean',
        lastName: 'Dupont',
        email: 'jean@example.com',
        questions: s.questions,
      }}
    />
  );
}
