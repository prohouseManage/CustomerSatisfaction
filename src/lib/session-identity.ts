import { sessionDateRange } from './session-dates';

export type SessionIdentity = {
  id: string;
  name: string;
  date: Date | string;
  endDate?: Date | string | null;
  trainer: string;
};
export function sessionLabel(session: SessionIdentity) {
  return `${session.id} · ${session.name} · ${sessionDateRange(session.date, session.endDate)} · ${session.trainer}`;
}
