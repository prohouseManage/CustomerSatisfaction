import { Prisma } from '@prisma/client';
import { db } from './db';
import { reportSessionWhere, type ReportFilters } from './report-filters';
import { sessionSqlWhere, ratingScaleSql, numericValueSql } from './report-queries';
import { ratingMax } from './validation';

type Options = {
  summary?: boolean;
  page?: number;
  pageSize?: number;
  commentLimit?: number;
  commentChars?: number;
};
type QuestionRow = {
  id: string;
  label: string;
  sessionId: string;
  session: string;
  type: string;
  active: boolean;
  options: string[];
};
type Aggregate = {
  id: string;
  count: number;
  average: number | null;
  distribution: Record<string, number>;
  comments: string[];
  commentCount: number;
};

export async function statistics(input: string | ReportFilters = {}, options: Options = {}) {
  const filters = typeof input === 'string' ? { sessionId: input } : input;
  const sessionWhere = reportSessionWhere(filters);
  const where = { session: sessionWhere };
  const condition = sessionSqlWhere(filters);
  const page = options.page || 1;
  const pageSize = options.pageSize || 50;
  const commentLimit = options.commentLimit ?? 20;
  const commentChars = options.commentChars ?? 500;
  const [sessions, participants, responses, score, activityRows, deliveries] = await Promise.all([
    db.trainingSession.count({ where: sessionWhere }),
    db.participant.count({ where }),
    db.response.count({ where }),
    db.$queryRaw<{ average: number | null }[]>(Prisma.sql`
      SELECT AVG(${numericValueSql} * 4 / (${ratingScaleSql})) AS average
      FROM "Response" r JOIN "TrainingSession" s ON s.id = r."sessionId"
      CROSS JOIN LATERAL jsonb_array_elements(r.answers) a
      JOIN "Question" q ON q.id = a->>'questionId' AND q."sessionId" = r."sessionId"
      WHERE ${condition}`),
    db.$queryRaw<{ month: string; count: number }[]>(Prisma.sql`
      SELECT to_char(r."submittedAt", 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM "Response" r JOIN "TrainingSession" s ON s.id = r."sessionId"
      WHERE ${condition} AND r."submittedAt" >= date_trunc('month', NOW() AT TIME ZONE 'UTC') - INTERVAL '5 months'
      GROUP BY 1 ORDER BY 1`),
    filters.sessionId || filters.dateFrom || filters.dateTo
      ? Promise.resolve(0)
      : db.webhookDelivery.count({ where: { deliveredAt: null } }),
  ]);
  const months = new Map<string, number>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.set(d.toISOString().slice(0, 7), 0);
  }
  activityRows.forEach((r) => {
    if (months.has(r.month)) months.set(r.month, r.count);
  });
  const eligible = Prisma.sql`${condition} AND (q.active OR EXISTS (
    SELECT 1 FROM "Response" r WHERE r."sessionId" = q."sessionId"
    AND r.answers @> jsonb_build_array(jsonb_build_object('questionId', q.id))))`;
  const [questions, totals] = options.summary
    ? [[], [{ count: 0 }]]
    : await Promise.all([
        db.$queryRaw<QuestionRow[]>(Prisma.sql`
      SELECT q.id, q.label, q."sessionId", s.name AS session, q.type::text, q.active, q.options
      FROM "Question" q JOIN "TrainingSession" s ON s.id = q."sessionId"
      WHERE ${eligible} ORDER BY s.date DESC, s.id, q.position, q.id
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
        db.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM "Question" q
      JOIN "TrainingSession" s ON s.id = q."sessionId" WHERE ${eligible}`),
      ]);
  const aggregates = questions.length
    ? await db.$queryRaw<Aggregate[]>(Prisma.sql`
    WITH expanded AS (
      SELECT q.id, q.type::text, a->'value' AS value, ${numericValueSql} AS numeric,
        CASE WHEN q.type::text IN ('SHORT_TEXT', 'LONG_TEXT') THEN a->>'value'
          ELSE NULLIF(a->>'comment', '') END AS comment,
        r."submittedAt", r.id AS response_id
      FROM "Response" r JOIN "TrainingSession" s ON s.id = r."sessionId"
      CROSS JOIN LATERAL jsonb_array_elements(r.answers) a
      JOIN "Question" q ON q.id = a->>'questionId' AND q."sessionId" = r."sessionId"
      WHERE ${condition} AND q.id IN (${Prisma.join(questions.map((q) => q.id))})
    ), counts AS (
      SELECT id, COUNT(*)::int AS count, AVG(numeric) AS average,
        COUNT(comment)::int AS "commentCount" FROM expanded GROUP BY id
    ), choices AS (
      SELECT id, CASE v WHEN 'true'::jsonb THEN 'Oui' WHEN 'false'::jsonb THEN 'Non'
        ELSE v #>> '{}' END AS choice, COUNT(*)::int AS count
      FROM expanded CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE jsonb_build_array(value) END) v
      WHERE type NOT IN ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER') GROUP BY id, choice
    ), distributions AS (
      SELECT id, jsonb_object_agg(choice, count) AS distribution FROM choices GROUP BY id
    ), ranked AS (
      SELECT id, comment, row_number() OVER (PARTITION BY id ORDER BY "submittedAt" DESC, response_id) AS n
      FROM expanded WHERE comment IS NOT NULL
    ), comments AS (
      SELECT id, jsonb_agg(CASE WHEN length(comment) > ${commentChars}
        THEN left(comment, ${commentChars}::int) || '…' ELSE comment END ORDER BY n) AS comments
      FROM ranked WHERE n <= ${commentLimit} GROUP BY id
    ) SELECT counts.*, COALESCE(distribution, '{}'::jsonb) AS distribution,
        COALESCE(comments.comments, '[]'::jsonb) AS comments
      FROM counts LEFT JOIN distributions USING (id) LEFT JOIN comments USING (id)`)
    : [];
  const byId = new Map(aggregates.map((a) => [a.id, a]));
  const results = questions.map((q) => {
    const a = byId.get(q.id);
    const max = ratingMax(q.type);
    const distribution: Record<string, number> = {};
    if (max) for (let i = 1; i <= max; i++) distribution[String(i)] = 0;
    else if (q.type === 'YES_NO') {
      distribution.Oui = 0;
      distribution.Non = 0;
    } else
      q.options.forEach((o) => {
        distribution[o] = 0;
      });
    return {
      id: q.id,
      label: q.label,
      session: q.session,
      sessionId: q.sessionId,
      type: q.type,
      archived: !q.active,
      count: a?.count || 0,
      average: a?.average ?? null,
      distribution: { ...distribution, ...a?.distribution },
      comments: a?.comments || [],
      commentCount: a?.commentCount || 0,
    };
  });
  return {
    sessions,
    participants,
    responses,
    responseRate: participants ? (responses / participants) * 100 : 0,
    satisfaction: score[0]?.average ?? null,
    pendingWebhooks: deliveries,
    results,
    resultsTotal: totals[0].count,
    resultsPage: page,
    resultsPageSize: pageSize,
    activity: [...months].map(([month, count]) => ({ month, count })),
  };
}
