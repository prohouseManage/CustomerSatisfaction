import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionDateRange } from '../src/lib/session-dates';
import {
  effectiveEmailPolicy,
  emailDueDate,
  luxembourgDate,
  invitationEmail,
  emailScheduleSchema,
} from '../src/lib/email-policy';
test('E-mail : calendrier local, changement de mois et heure été/hiver', () => {
  assert.equal(emailDueDate(new Date('2026-01-31'), 1), '2026-02-01');
  assert.equal(emailDueDate(new Date('2026-12-28'), 7), '2027-01-04');
  assert.equal(luxembourgDate(new Date('2026-03-29T22:30:00Z')), '2026-03-30');
  assert.equal(luxembourgDate(new Date('2026-10-25T23:30:00Z')), '2026-10-26');
  assert.deepEqual(
    effectiveEmailPolicy({ enabled: true, delayDays: 1 }, { mode: 'CUSTOM', delayDays: 7 }),
    { enabled: true, delayDays: 7 },
  );
  assert.equal(
    effectiveEmailPolicy({ enabled: false, delayDays: 1 }, { mode: 'CUSTOM', delayDays: 7 })
      .enabled,
    false,
  );
  assert.equal(
    effectiveEmailPolicy({ enabled: true, delayDays: 1 }, { mode: 'OFF' }).enabled,
    false,
  );
  assert.equal(emailScheduleSchema.safeParse({ mode: 'CUSTOM', delayDays: null }).success, false);
});
test('E-mail : bouton personnel et échappement HTML des noms', () => {
  const message = invitationEmail({
    firstName: '<script>alert(1)</script>',
    sessionName: 'Formation "A"\r\nB',
    date: new Date('2026-12-11'),
    url: 'https://survey.example.org/form/TEST/token',
    trainer: '<img src=x onerror=alert(1)>',
    sessionId: 'SESSION-&-001',
  });
  assert.ok(message.html.includes('Répondre au questionnaire'));
  assert.ok(message.html.includes('https://survey.example.org/form/TEST/token'));
  assert.ok(!message.html.includes('<script>'));
  assert.ok(!message.html.includes('<img src=x'));
  assert.ok(message.text.includes('Référence de session : SESSION-&-001'));
  assert.ok(message.text.includes('https://survey.example.org/form/TEST/token'));
  assert.ok(!/[\r\n]/.test(message.subject));
  assert.throws(
    () =>
      invitationEmail({
        firstName: 'Test',
        sessionName: 'Test',
        date: new Date('2026-12-11'),
        url: 'javascript:alert(1)',
      }),
    /Lien de questionnaire invalide/,
  );
});
test('période complète dans les invitations et journée unique sans date répétée', () => {
  const input = {
    firstName: 'Test',
    sessionName: 'Formation',
    date: new Date('2026-12-07'),
    endDate: new Date('2026-12-10'),
    url: 'https://survey.example.org/form/TEST/token',
  };
  const message = invitationEmail(input);
  assert.ok(message.text.includes('7 décembre 2026 – 10 décembre 2026'));
  assert.ok(message.html.includes('7 décembre 2026 – 10 décembre 2026'));
  assert.equal(sessionDateRange(input.date, input.date), sessionDateRange(input.date));
  assert.equal(
    sessionDateRange('2026-12-07', '2026-12-10', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    '07/12/2026 – 10/12/2026',
  );
});
