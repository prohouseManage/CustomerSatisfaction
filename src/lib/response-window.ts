import { luxembourgDate } from './email-policy';

export function deadlinePassed(deadline?: Date | string | null, now = new Date()) {
  return Boolean(deadline && new Date(deadline).toISOString().slice(0, 10) < luxembourgDate(now));
}
export function responsesOpen(
  session: {
    status: string;
    responseDeadline?: Date | string | null;
    responsesClosedAt?: Date | string | null;
  },
  now = new Date(),
) {
  return (
    session.status === 'ACTIVE' &&
    !session.responsesClosedAt &&
    !deadlinePassed(session.responseDeadline, now)
  );
}
