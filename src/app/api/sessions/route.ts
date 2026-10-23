import { api, ApiError, requireStaff, readJson } from '@/lib/security';
import { sessionSchema } from '@/lib/validation';
import { db } from '@/lib/db';
import { listSessions, sessionInclude } from '@/lib/sessions';
import { saveOdooConnection } from '@/lib/odoo-config';
import { saveEmailSchedule, applySessionEmailTransition } from '@/lib/emails';
export const GET = api(async (request) => {
  await requireStaff(request);
  return Response.json(
    await listSessions(new URL(request.url).searchParams.get('compact') === 'true'),
  );
});
export const POST = api(async (request) => {
  await requireStaff(request);
  const {
    questions,
    date,
    endDate,
    responseDeadline,
    odooUrl,
    odooEnabled,
    emailSchedule,
    emailReactivation,
    ...data
  } = sessionSchema.parse(await readJson(request));
  if (emailReactivation)
    throw new ApiError(400, 'La reprise des e-mails concerne une session existante.');
  const session = await db.$transaction(async (tx) => {
    const created = await tx.trainingSession.create({
      data: {
        ...data,
        archivedAt: data.status === 'ARCHIVED' ? new Date() : null,
        date: new Date(date),
        endDate: new Date(endDate || date),
        responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
        questions: { create: questions.map((q, position) => ({ ...q, position })) },
      },
      include: sessionInclude,
    });
    await saveOdooConnection(tx, created.id, odooUrl, odooEnabled);
    await saveEmailSchedule(tx, created.id, emailSchedule);
    await applySessionEmailTransition(tx, created.id, 'DRAFT', data.status);
    return tx.trainingSession.findUniqueOrThrow({
      where: { id: created.id },
      include: sessionInclude,
    });
  });
  return Response.json(session, { status: 201 });
});
