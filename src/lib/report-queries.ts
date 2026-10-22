import { Prisma } from '@prisma/client';
import type { ReportFilters } from './report-filters';

/** Fixed SQL identifiers only; all filter values remain bound parameters. */
export function sessionSqlWhere(filters: ReportFilters) {
  return Prisma.sql`
    (${filters.sessionId || null}::text IS NULL OR s."id" = ${filters.sessionId || null})
    AND (${filters.dateTo || null}::date IS NULL OR s."date" <= ${filters.dateTo || null}::date)
    AND (${filters.dateFrom || null}::date IS NULL OR COALESCE(s."endDate", s."date") >= ${filters.dateFrom || null}::date)`;
}
export const ratingScaleSql = Prisma.sql`CASE q."type"::text
  WHEN 'RATING_4' THEN 4 WHEN 'RATING_5' THEN 5 WHEN 'RATING_10' THEN 10 END`;
export const numericValueSql = Prisma.sql`CASE WHEN jsonb_typeof(a->'value') = 'number'
  THEN (a->>'value')::double precision END`;
