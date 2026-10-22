/** Calendar dates are stored at UTC midnight, without time-of-day semantics. */
export function sessionDateRange(
  date: Date | string,
  endDate?: Date | string | null,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  locale = 'fr-LU',
) {
  const start = new Date(date);
  const end = endDate ? new Date(endDate) : start;
  const format = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  return start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)
    ? format.format(start)
    : `${format.format(start)} – ${format.format(end)}`;
}
