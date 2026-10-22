import { db } from './db';
import { ratingMax, type Answer } from './validation';
import { reportSessionWhere, type ReportFilters } from './report-filters';
export async function statistics(input: string | ReportFilters = {}) {
  const filters = typeof input === 'string' ? { sessionId: input } : input;
  const sessionWhere = reportSessionWhere(filters);
  const where = { session: sessionWhere };
  const [sessions, participants, responses, questions, deliveries] = await Promise.all([
    db.trainingSession.count({ where: sessionWhere }),
    db.participant.count({ where }),
    db.response.findMany({ where, orderBy: { submittedAt: 'asc' } }),
    db.question.findMany({
      where,
      orderBy: { position: 'asc' },
      include: { session: { select: { name: true } } },
    }),
    filters.sessionId || filters.dateFrom || filters.dateTo
      ? Promise.resolve(0)
      : db.webhookDelivery.count({ where: { deliveredAt: null } }),
  ]);
  const ratings: number[] = [];
  const results = questions
    .filter(
      (q) =>
        q.active ||
        responses.some((r) => (r.answers as Answer[]).some((a) => a.questionId === q.id)),
    )
    .map((q) => {
      const answers = responses.flatMap((r) =>
        (r.answers as Answer[]).filter((a) => a.questionId === q.id),
      );
      const values = answers.map((answer) => answer.value);
      const max = ratingMax(q.type);
      if (max)
        ratings.push(
          ...values.filter((v): v is number => typeof v === 'number').map((v) => (v / max) * 4),
        );
      const numeric = values.filter((v): v is number => typeof v === 'number');
      const distribution: Record<string, number> = {};
      if (max) for (let i = 1; i <= max; i++) distribution[String(i)] = 0;
      else if (q.type === 'YES_NO') {
        distribution.Oui = 0;
        distribution.Non = 0;
      } else q.options.forEach((o) => (distribution[o] = 0));
      if (!['SHORT_TEXT', 'LONG_TEXT', 'NUMBER'].includes(q.type))
        values.forEach((v) =>
          (Array.isArray(v) ? v : [v]).forEach((x) => {
            const k = typeof x === 'boolean' ? (x ? 'Oui' : 'Non') : String(x);
            distribution[k] = (distribution[k] || 0) + 1;
          }),
        );
      return {
        id: q.id,
        label: q.label,
        session: q.session.name,
        sessionId: q.sessionId,
        type: q.type,
        archived: !q.active,
        count: values.length,
        average: numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null,
        distribution,
        comments: ['SHORT_TEXT', 'LONG_TEXT'].includes(q.type)
          ? values.map(String)
          : answers.flatMap((answer) => (answer.comment ? [answer.comment] : [])),
      };
    });
  const months = new Map<string, number>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.set(d.toISOString().slice(0, 7), 0);
  }
  responses.forEach((r) => {
    const k = r.submittedAt.toISOString().slice(0, 7);
    if (months.has(k)) months.set(k, months.get(k)! + 1);
  });
  return {
    sessions,
    participants,
    responses: responses.length,
    responseRate: participants ? (responses.length / participants) * 100 : 0,
    satisfaction: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    pendingWebhooks: deliveries,
    results,
    activity: [...months].map(([month, count]) => ({ month, count })),
  };
}
