import { notFound } from 'next/navigation';
import { demoAllowed } from '@/lib/demo';
import Workspace from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; session?: string }>;
}) {
  if (!demoAllowed()) notFound();
  const params = await searchParams;
  return (
    <Workspace demo name="Alex Morgan" initialView={params.view} initialSession={params.session} />
  );
}
