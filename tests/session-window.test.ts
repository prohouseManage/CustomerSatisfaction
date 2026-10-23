import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlinePassed, responsesOpen } from '../src/lib/response-window';
import { sessionLabel } from '../src/lib/session-identity';
import { sessionSchema, defaultQuestions } from '../src/lib/validation';

test('date limite incluse à Luxembourg, passages heure été/hiver et sans date', () => {
  for (const [date, before, after] of [
    ['2026-10-23', '2026-10-23T21:59:59.999Z', '2026-10-23T22:00:00Z'],
    ['2026-10-25', '2026-10-25T22:59:59.999Z', '2026-10-25T23:00:00Z'],
    ['2026-03-29', '2026-03-29T21:59:59.999Z', '2026-03-29T22:00:00Z'],
  ]) {
    assert.equal(deadlinePassed(date, new Date(before)), false);
    assert.equal(deadlinePassed(date, new Date(after)), true);
  }
  assert.equal(responsesOpen({ status: 'ACTIVE', responseDeadline: null }), true);
  assert.equal(responsesOpen({ status: 'DRAFT' }), false);
  assert.equal(responsesOpen({ status: 'ARCHIVED' }), false);
  assert.equal(
    responsesOpen({
      status: 'ACTIVE',
      responseDeadline: '2099-12-31',
      responsesClosedAt: '2026-10-23T08:00:00Z',
    }),
    false,
  );
  assert.equal(responsesOpen({ status: 'ACTIVE', responsesClosedAt: null }), true);
});
test('identification des formations homonymes et validation de la date limite', () => {
  const a = { id: 'TEST-001', name: 'Même formation', date: '2026-10-01', trainer: 'Jean Dupont' };
  const b = { ...a, id: 'TEST-002', date: '2026-10-02', trainer: 'Marie Martin' };
  assert.notEqual(sessionLabel(a), sessionLabel(b));
  assert.ok(sessionLabel(a).includes(a.id) && sessionLabel(a).includes(a.trainer));
  const input = { ...a, questions: defaultQuestions };
  assert.equal(
    sessionSchema.safeParse({ ...input, responseDeadline: '2026-02-30' }).success,
    false,
  );
  assert.equal(sessionSchema.safeParse({ ...input, responseDeadline: null }).success, true);
  assert.equal(sessionSchema.safeParse({ ...input, responseDeadline: '2026-10-31' }).success, true);
});
