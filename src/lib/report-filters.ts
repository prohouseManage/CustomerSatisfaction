import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const calendarDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Date invalide : utilisez une date réelle au format AAAA-MM-JJ.');
const reportFilterSchema = z
  .object({
    sessionId: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,49}$/, 'Identifiant de session invalide.')
      .optional(),
    dateFrom: calendarDate.optional(),
    dateTo: calendarDate.optional(),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    path: ['dateTo'],
    message: 'La date de fin doit être égale ou postérieure à la date de début.',
  });
export type ReportFilters = z.infer<typeof reportFilterSchema>;

export function parseReportFilters(params: URLSearchParams): ReportFilters {
  return reportFilterSchema.parse({
    sessionId: params.get('sessionId') || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
  });
}

/** Include any training whose calendar period overlaps the requested inclusive dates. */
export function reportSessionWhere(filters: ReportFilters): Prisma.TrainingSessionWhereInput {
  return {
    ...(filters.sessionId && { id: filters.sessionId }),
    ...(filters.dateTo && { date: { lte: new Date(filters.dateTo + 'T00:00:00Z') } }),
    ...(filters.dateFrom && {
      OR: [
        { endDate: { gte: new Date(filters.dateFrom + 'T00:00:00Z') } },
        { endDate: null, date: { gte: new Date(filters.dateFrom + 'T00:00:00Z') } },
      ],
    }),
  };
}

export function matchesReportSession(
  session: { id: string; date: string; endDate?: string | null },
  filters: ReportFilters,
) {
  return (
    (!filters.sessionId || session.id === filters.sessionId) &&
    (!filters.dateTo || session.date.slice(0, 10) <= filters.dateTo) &&
    (!filters.dateFrom || (session.endDate || session.date).slice(0, 10) >= filters.dateFrom)
  );
}
