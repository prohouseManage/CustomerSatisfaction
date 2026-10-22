import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import Workspace from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; session?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');
  const admin = await db.admin.findUnique({ where: { email: session.user.email } });
  if (!admin) redirect('/login');
  const params = await searchParams;
  return (
    <Workspace
      demo={false}
      name={admin.name}
      initialView={params.view}
      initialSession={params.session}
    />
  );
}
