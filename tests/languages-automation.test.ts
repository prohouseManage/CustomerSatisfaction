import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { displayQuestion, languageCode } from '../src/lib/question-i18n';
import {
  defaultQuestions,
  questionSchema,
  submitSchema,
  validateAnswers,
} from '../src/lib/validation';
import { generateToken } from '../src/lib/crypto';
import { cronTimes } from '../src/lib/automation-policy';
import { browserFormLanguage, initialFormLanguage } from '../src/lib/form-language';
test('langue initiale : français par défaut, réglage de session et détection avec repli anglais', () => {
  assert.equal(initialFormLanguage({ acceptLanguage: 'de-DE' }), 'fr');
  assert.equal(initialFormLanguage({ configured: 'en', acceptLanguage: 'fr-FR' }), 'en');
  assert.equal(
    initialFormLanguage({ configured: 'de', requested: 'fr', acceptLanguage: 'en-US' }),
    'fr',
  );
  assert.equal(
    initialFormLanguage({ configured: 'auto', requested: 'invalid', acceptLanguage: 'de-CH' }),
    'de',
  );
  for (const [header, expected] of [
    ['fr-LU,fr;q=0.9,en;q=0.8', 'fr'],
    ['DE-ch,de;q=0.8', 'de'],
    ['en-GB,en;q=0.8', 'en'],
    ['es-ES,fr;q=0.8', 'en'],
    ['pt-BR,en;q=0.9', 'en'],
    ['fr;q=0,de;q=0.8', 'de'],
    ['en;q=0.4,fr-CA;q=0.9', 'fr'],
    ['*', 'en'],
    ['', 'en'],
    ['fr;q=bad,de;q=0.5', 'de'],
    ['fr;q=0,en;q=0', 'en'],
  ] as const)
    assert.equal(browserFormLanguage(header), expected);
});
test('les douze questions standard sont traduites, sans changer leurs valeurs', () => {
  for (const q of defaultQuestions)
    for (const lang of ['de', 'en'] as const) {
      const display = displayQuestion(q, lang);
      assert.equal(display.missing, false);
      assert.notEqual(display.label, q.label);
    }
  const q = {
    id: randomUUID(),
    label: 'Choix personnalisé',
    type: 'SELECT' as const,
    required: true,
    options: ['Présentiel', 'Distanciel'],
    translations: { en: { label: 'Training format', options: ['In person', 'Online'] } },
  };
  assert.deepEqual(displayQuestion(q, 'en').options, ['In person', 'Online']);
  assert.deepEqual(validateAnswers([q], [{ questionId: q.id, value: q.options[1] }]), [
    { questionId: q.id, value: 'Distanciel' },
  ]);
  assert.throws(() => validateAnswers([q], [{ questionId: q.id, value: 'Online' }]));
  assert.equal(displayQuestion(q, 'de').missing, true);
  assert.equal(displayQuestion(q, 'de').label, q.label);
  assert.equal(
    questionSchema.safeParse({
      ...q,
      translations: { en: { label: 'Format', options: ['Only one'] } },
    }).success,
    false,
  );
  assert.equal(
    questionSchema.safeParse({
      ...q,
      translations: { en: { label: 'Format', options: ['Same', 'Same'] } },
    }).success,
    false,
  );
  assert.equal(languageCode('es'), 'fr');
  assert.equal(
    submitSchema.safeParse({
      sessionId: 'TEST',
      token: generateToken(),
      language: 'es',
      answers: [],
    }).success,
    false,
  );
});
test('le suivi utilise les échéances UTC et une marge de deux heures', () => {
  assert.deepEqual(cronTimes(new Date('2026-10-22T05:30:00Z')), {
    expected: '2026-10-21T06:00:00.000Z',
    next: '2026-10-22T06:00:00.000Z',
    gracePassed: true,
  });
  assert.equal(cronTimes(new Date('2026-10-22T07:59:00Z')).gracePassed, false);
  assert.equal(cronTimes(new Date('2026-10-22T08:01:00Z')).gracePassed, true);
});
