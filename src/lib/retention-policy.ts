import { z } from 'zod';
export const deletionPhrase = 'supprimer la session';
export const deletionSchema = z.object({ confirmation: z.literal(deletionPhrase) }).strict();
export const retentionSchema = z
  .object({
    enabled: z.boolean(),
    value: z.number().int().min(1).max(10000),
    unit: z.enum(['DAYS', 'MONTHS', 'YEARS']),
  })
  .strict();
export type RetentionPolicy = z.infer<typeof retentionSchema>;
export const defaultRetention: RetentionPolicy = { enabled: false, value: 2, unit: 'MONTHS' };
export function retentionDeadline(
  archivedAt: Date,
  policy: Pick<RetentionPolicy, 'value' | 'unit'>,
) {
  const deadline = new Date(archivedAt);
  if (policy.unit === 'DAYS') {
    deadline.setUTCDate(deadline.getUTCDate() + policy.value);
    return deadline;
  }
  const day = deadline.getUTCDate();
  deadline.setUTCDate(1);
  if (policy.unit === 'MONTHS') deadline.setUTCMonth(deadline.getUTCMonth() + policy.value);
  else deadline.setUTCFullYear(deadline.getUTCFullYear() + policy.value);
  const endOfMonth = new Date(deadline);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  deadline.setUTCDate(Math.min(day, endOfMonth.getUTCDate()));
  return deadline;
}
export function archiveTimestamp(
  previousStatus: string,
  previousDate: Date | null,
  nextStatus: string,
  now = new Date(),
) {
  return nextStatus === 'ARCHIVED'
    ? previousStatus === 'ARCHIVED' && previousDate
      ? previousDate
      : now
    : null;
}
