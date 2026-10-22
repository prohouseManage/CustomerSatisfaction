import { z } from 'zod';
export const emailSettingsSchema = z
  .object({ enabled: z.boolean(), delayDays: z.number().int().min(1).max(365) })
  .strict();
export const emailScheduleSchema = z
  .object({
    mode: z.enum(['INHERIT', 'CUSTOM', 'OFF']),
    delayDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .strict()
  .refine((v) => v.mode !== 'CUSTOM' || v.delayDays != null, 'Précisez le délai personnalisé.');
export type EmailPolicy = z.infer<typeof emailSettingsSchema>;
export type EmailSchedule = z.infer<typeof emailScheduleSchema>;
// A session GET can be sent back on PATCH. Suspension metadata is read-only;
// only the explicit reactivation action may alter it.
export const emailScheduleInputSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { suspended: _, resumeOn: __, ...input } = value as Record<string, unknown>;
  return input;
}, emailScheduleSchema.nullish());
export const emailReactivationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('KEEP_PAUSED') }).strict(),
  z
    .object({
      action: z.literal('RESCHEDULE'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(
          (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
          'Date de reprise invalide.',
        ),
    })
    .strict(),
]);
export type EmailReactivation = z.infer<typeof emailReactivationSchema>;
export type SavedEmailSchedule = EmailSchedule & {
  suspended?: boolean;
  resumeOn?: Date | string | null;
};
export const defaultEmailPolicy: EmailPolicy = { enabled: false, delayDays: 1 };
export function effectiveEmailPolicy(
  policy: EmailPolicy,
  schedule?: SavedEmailSchedule | null,
): EmailPolicy {
  if (schedule?.mode === 'OFF' || schedule?.suspended) return { ...policy, enabled: false };
  return {
    enabled: policy.enabled,
    delayDays: schedule?.mode === 'CUSTOM' ? schedule.delayDays! : policy.delayDays,
  };
}
export function scheduledEmailDate(
  date: Date,
  policy: EmailPolicy,
  schedule?: SavedEmailSchedule | null,
) {
  const due = emailDueDate(date, policy.delayDays);
  const resume = schedule?.resumeOn ? new Date(schedule.resumeOn).toISOString().slice(0, 10) : '';
  return resume > due ? resume : due;
}
export function emailDueDate(date: Date, delayDays: number) {
  const due = new Date(date.toISOString().slice(0, 10) + 'T00:00:00Z');
  due.setUTCDate(due.getUTCDate() + delayDays);
  return due.toISOString().slice(0, 10);
}
export function luxembourgDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Luxembourg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join('-');
}
export { invitationEmail } from './email-template';
