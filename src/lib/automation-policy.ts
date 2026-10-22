export type AutomationStep = {
  name: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  summary: string;
};
export type AutomationRunView = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  steps: AutomationStep[];
};
export function cronTimes(now = new Date()) {
  const expected = new Date(now);
  expected.setUTCHours(6, 0, 0, 0);
  if (expected > now) expected.setUTCDate(expected.getUTCDate() - 1);
  const next = new Date(expected);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    expected: expected.toISOString(),
    next: next.toISOString(),
    gracePassed: now.getTime() - expected.getTime() > 2 * 3600000,
  };
}
