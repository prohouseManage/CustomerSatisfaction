import { api, requireStaff, rateLimit, ApiError } from '@/lib/security';
import { db } from '@/lib/db';
import { statistics } from '@/lib/reports';
import { excelResponse } from '@/lib/excel';
import type { Answer } from '@/lib/validation';
import { jsPDF } from 'jspdf';
import { parseReportFilters, reportSessionWhere } from '@/lib/report-filters';
import { sessionDateRange } from '@/lib/session-dates';
import { Prisma } from '@prisma/client';
import { sessionSqlWhere } from '@/lib/report-queries';
import { assertExportBytes } from '@/lib/export-limits';
export const maxDuration = 60;
export const GET = api(async (request) => {
  const admin = await requireStaff(request);
  await rateLimit(`report:${admin.id}`, 10, 300);
  const params = new URL(request.url).searchParams;
  const filters = parseReportFilters(params);
  const { sessionId, dateFrom, dateTo } = filters;
  const sessionWhere = reportSessionWhere(filters);
  const format = params.get('format') || 'xlsx';
  if (!['xlsx', 'pdf'].includes(format)) throw new ApiError(400, 'Format invalide.');
  // Check volume in PostgreSQL before allocating responses, PDF pages or workbook rows.
  const [volume] = await db.$queryRaw<
    { responses: number; answers: number; bytes: bigint }[]
  >(Prisma.sql`
    SELECT COUNT(*)::int AS responses, COALESCE(SUM(jsonb_array_length(r.answers)),0)::int AS answers,
      COALESCE(SUM(octet_length(r.answers::text)),0)::bigint AS bytes
    FROM "Response" r JOIN "TrainingSession" s ON s.id=r."sessionId" WHERE ${sessionSqlWhere(filters)}`);
  const [sessionCount, questionCount] = await Promise.all([
    db.trainingSession.count({ where: sessionWhere }),
    db.question.count({ where: { session: sessionWhere } }),
  ]);
  if (
    volume.responses > 5000 ||
    volume.answers > 100000 ||
    volume.bytes > 8_000_000n ||
    sessionCount > 500 ||
    questionCount > 2000
  )
    throw new ApiError(
      413,
      'Export trop volumineux. Réduisez la période ou sélectionnez une session.',
    );
  const stats = await statistics(filters, {
    pageSize: 2000,
    commentLimit: 5000,
    commentChars: 10000,
  });
  const sessions = await db.trainingSession.findMany({
    where: sessionWhere,
    orderBy: [{ date: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      date: true,
      endDate: true,
      trainer: true,
      status: true,
      _count: { select: { participants: true, responses: true } },
    },
  });
  const summary = [
    {
      Sessions: stats.sessions,
      Participants: stats.participants,
      Réponses: stats.responses,
      'Taux de réponse (%)': Number(stats.responseRate.toFixed(1)),
      'Satisfaction / 4': stats.satisfaction === null ? '' : Number(stats.satisfaction.toFixed(2)),
      'Formation à partir du': dateFrom || '',
      'Formation jusqu’au': dateTo || '',
    },
  ];
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  if (format === 'xlsx') {
    const responses = await db.response.findMany({
      where: { session: sessionWhere },
      include: {
        participant: { select: { lastName: true, firstName: true, email: true } },
        session: {
          select: { name: true, date: true, endDate: true, trainer: true, questions: true },
        },
      },
    });
    return excelResponse(
      [
        { name: 'Synthèse', rows: summary },
        {
          name: 'Sessions',
          rows: sessions.map((session) => ({
            'ID session': session.id,
            Formation: session.name,
            'Date de début': session.date.toISOString().slice(0, 10),
            'Date de fin': (session.endDate || session.date).toISOString().slice(0, 10),
            Formateur: session.trainer,
            Statut: { ACTIVE: 'Active', DRAFT: 'Brouillon', ARCHIVED: 'Archivée' }[session.status],
            Participants: session._count.participants,
            Réponses: session._count.responses,
          })),
        },
        {
          name: 'Résultats par question',
          rows: stats.results.map((q) => ({
            Session: q.session,
            'ID session': q.sessionId,
            'Dates de formation':
              q.sessionId && sessionsById.has(q.sessionId)
                ? sessionDateRange(
                    sessionsById.get(q.sessionId)!.date,
                    sessionsById.get(q.sessionId)!.endDate,
                  )
                : '',
            Formateur: q.sessionId ? sessionsById.get(q.sessionId)?.trainer || '' : '',
            Question: q.label,
            Type: q.type,
            Version: q.archived ? 'Ancien questionnaire' : 'Questionnaire actuel',
            Réponses: q.count,
            Moyenne: q.average ?? '',
            Répartition: JSON.stringify(q.distribution),
          })),
        },
        {
          name: 'Réponses détaillées',
          rows: responses.flatMap((r) =>
            (r.answers as Answer[]).map((a) => ({
              Session: r.sessionId,
              Formation: r.session.name,
              'Dates de formation': sessionDateRange(r.session.date, r.session.endDate),
              Formateur: r.session.trainer,
              Nom: r.participant.lastName,
              Prénom: r.participant.firstName,
              Email: r.participant.email,
              Date: r.submittedAt.toISOString(),
              Commentaire: a.comment || '',
              Question:
                r.session.questions.find((q) => q.id === a.questionId)?.label || a.questionId,
              Réponse: Array.isArray(a.value)
                ? a.value.join(', ')
                : typeof a.value === 'boolean'
                  ? a.value
                    ? 'Oui'
                    : 'Non'
                  : a.value,
            })),
          ),
        },
      ],
      `rapport-${sessionId || 'global'}`,
    );
  }
  if (format !== 'pdf') throw new ApiError(400, 'Format invalide.');
  const pdf = new jsPDF();
  let y = 24;
  const write = (text: string, size = 10) => {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, 170) as string[];
    for (const line of lines) {
      if (y > 275) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, 20, y);
      y += size * 0.5 + 2;
    }
    y += 3;
  };
  pdf.setTextColor(194, 14, 103);
  write('HOUSE OF TRAINING', 18);
  pdf.setTextColor(35, 30, 45);
  write('Rapport de satisfaction', 15);
  write(`Périmètre : ${sessionId || 'Toutes les sessions'}`);
  if (dateFrom || dateTo)
    write(
      `Dates des formations : ${dateFrom || 'sans limite'} au ${dateTo || 'sans limite'} (bornes incluses)`,
    );
  write(`Généré le ${new Date().toLocaleDateString('fr-LU', { timeZone: 'Europe/Luxembourg' })}`);
  write(
    `${stats.responses} réponses / ${stats.participants} participants - Participation : ${stats.responseRate.toFixed(1)} %`,
  );
  write(`Satisfaction normalisée : ${stats.satisfaction?.toFixed(2) || 'Non disponible'} / 4`);
  write('Sessions du périmètre', 12);
  for (const session of sessions)
    write(`${session.id} - ${session.name} - ${sessionDateRange(session.date, session.endDate)}`);
  for (const q of stats.results) {
    write(
      `${q.sessionId} - ${q.session} - ${q.label}${q.archived ? ' (ancien questionnaire)' : ''}`,
      12,
    );
    write(
      `${q.count} réponse(s)${q.average !== null ? ` - Moyenne : ${q.average.toFixed(2)}` : ''}`,
    );
    if (Object.keys(q.distribution).length)
      write(
        Object.entries(q.distribution)
          .map(([k, v]) => `${k} : ${v}`)
          .join('  |  '),
      );
    q.comments.forEach((c) => write(`Commentaire : ${c}`));
  }
  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  assertExportBytes(bytes.length);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapport-${sessionId || 'global'}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});
