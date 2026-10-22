import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  defaultQuestions,
  submitSchema,
  sessionSchema,
  validateAnswers,
  type QuestionInput,
} from '../src/lib/validation';
import {
  generateToken,
  hashToken,
  encryptToken,
  decryptToken,
  secretMatches,
} from '../src/lib/crypto';
import { parseParticipants } from '../src/lib/excel';
const make = (type: QuestionInput['type'], required = true, options: string[] = []) => ({
  id: randomUUID(),
  label: 'Votre appréciation',
  type,
  required,
  options,
});
test('les types de questions sont validés sans conversion implicite', () => {
  const cases: [QuestionInput['type'], unknown, unknown][] = [
    ['SHORT_TEXT', 'Bonjour', 4],
    ['LONG_TEXT', 'Une remarque', false],
    ['NUMBER', 3.14, '3.14'],
    ['RATING_4', 4, 5],
    ['RATING_5', 5, 6],
    ['RATING_10', 10, 0],
    ['YES_NO', false, 'non'],
    ['SINGLE_CHOICE', 'A', 'C'],
    ['MULTIPLE_CHOICE', ['A', 'B'], ['A', 'A']],
    ['SELECT', 'B', 'C'],
  ];
  for (const [type, valid, invalid] of cases) {
    const q = make(type, true, ['A', 'B']);
    assert.equal(validateAnswers([q], [{ questionId: q.id, value: valid as never }]).length, 1);
    assert.throws(
      () => validateAnswers([q], [{ questionId: q.id, value: invalid as never }]),
      /invalide/,
    );
  }
});
test('modèle House of Training : 11 notes obligatoires sur 4 et suggestions facultatives', () => {
  assert.equal(defaultQuestions.length, 12);
  assert.ok(defaultQuestions.slice(0, 11).every((q) => q.type === 'RATING_4' && q.required));
  assert.equal(defaultQuestions[0].label, 'La formation correspondait globalement à mes attentes');
  assert.equal(
    defaultQuestions[10].label,
    "L'encadrement et l'organisation de la formation étaient de qualité",
  );
  assert.equal(defaultQuestions[11].label, 'Suggestions d’amélioration');
  assert.equal(defaultQuestions[11].required, false);
});
test('commentaires de notes : conservation, nettoyage, limites et absence de perte silencieuse', () => {
  const q = make('RATING_4');
  assert.deepEqual(
    validateAnswers([q], [{ questionId: q.id, value: 4, comment: '  Très utile.  ' }]),
    [{ questionId: q.id, value: 4, comment: 'Très utile.' }],
  );
  assert.deepEqual(validateAnswers([q], [{ questionId: q.id, value: 1, comment: '  ' }]), [
    { questionId: q.id, value: 1 },
  ]);
  assert.throws(
    () => validateAnswers([q], [{ questionId: q.id, value: 4, comment: 'x'.repeat(2001) }]),
    /Commentaire invalide/,
  );
  assert.throws(
    () =>
      validateAnswers(
        [{ ...q, required: false }],
        [{ questionId: q.id, value: '', comment: 'Mon avis' }],
      ),
    /Choisissez une note/,
  );
  const text = make('LONG_TEXT');
  assert.throws(
    () =>
      validateAnswers([text], [{ questionId: text.id, value: 'Avis', comment: 'Un autre avis' }]),
    /ne permet pas/,
  );
  const request = {
    sessionId: 'DORA-001',
    token: generateToken(),
    answers: [{ questionId: q.id, value: 4, comment: 'Mon avis' }],
  };
  assert.equal(submitSchema.parse(request).answers[0].comment, 'Mon avis');
  for (const value of [0, 5, 2.5, NaN])
    assert.throws(() => validateAnswers([q], [{ questionId: q.id, value }]), /invalide/);
});
test('questions requises, facultatives, inconnues et répétées', () => {
  const q = make('RATING_5');
  assert.throws(() => validateAnswers([q], []), /obligatoire/);
  assert.deepEqual(validateAnswers([{ ...q, required: false }], []), []);
  assert.throws(() => validateAnswers([q], [{ questionId: randomUUID(), value: 3 }]), /inconnues/);
  assert.throws(
    () =>
      validateAnswers(
        [q],
        [
          { questionId: q.id, value: 3 },
          { questionId: q.id, value: 3 },
        ],
      ),
    /dupliquées/,
  );
});
test('nombres finis, limites de texte et notes entières', () => {
  for (const [type, value] of [
    ['NUMBER', NaN],
    ['NUMBER', Infinity],
    ['RATING_5', 2.5],
    ['SHORT_TEXT', 'x'.repeat(501)],
  ] as const) {
    const q = make(type);
    assert.throws(() => validateAnswers([q], [{ questionId: q.id, value }]), /invalide/);
  }
});
test('identifiants, dates réelles et choix distincts', () => {
  const data = {
    id: 'DORA-2026-001',
    name: 'DORA Foundation',
    date: '2026-12-11',
    trainer: 'Jean Dupont',
    questions: defaultQuestions,
  };
  assert.ok(sessionSchema.safeParse(data).success);
  for (const formLanguage of ['fr', 'de', 'en', 'auto'])
    assert.ok(sessionSchema.safeParse({ ...data, formLanguage }).success);
  assert.equal(sessionSchema.safeParse({ ...data, formLanguage: 'es' }).success, false);
  assert.ok(sessionSchema.safeParse({ ...data, endDate: data.date }).success);
  assert.ok(sessionSchema.safeParse({ ...data, endDate: '2026-12-14' }).success);
  assert.ok(sessionSchema.safeParse({ ...data, endDate: null }).success);
  assert.ok(!sessionSchema.safeParse({ ...data, endDate: '2026-12-10' }).success);
  assert.ok(!sessionSchema.safeParse({ ...data, endDate: '2026-02-30' }).success);
  assert.ok(sessionSchema.safeParse({ ...data, emailSchedule: null, status: 'ARCHIVED' }).success);
  assert.ok(
    sessionSchema.safeParse({ ...data, emailSchedule: { mode: 'INHERIT', delayDays: null } })
      .success,
  );
  assert.deepEqual(
    sessionSchema.parse({
      ...data,
      emailSchedule: { mode: 'INHERIT', delayDays: null, suspended: false, resumeOn: null },
    }).emailSchedule,
    { mode: 'INHERIT', delayDays: null },
  );
  assert.ok(!sessionSchema.safeParse({ ...data, emailSchedule: 'invalid' }).success);
  assert.ok(!sessionSchema.safeParse({ ...data, date: '2026-02-30' }).success);
  assert.ok(!sessionSchema.safeParse({ ...data, id: '../../etc' }).success);
  assert.ok(
    !sessionSchema.safeParse({
      ...data,
      questions: [
        { label: 'Choisissez une réponse', type: 'SELECT', required: true, options: ['A', 'A'] },
      ],
    }).success,
  );
});
test('tokens 256 bits, chiffrement authentifié et vérification des secrets', () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const token = generateToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, generateToken());
  assert.equal(hashToken(token).length, 64);
  const encrypted = encryptToken(token);
  assert.equal(decryptToken(encrypted), token);
  assert.notEqual(encrypted, encryptToken(token));
  const modified = Buffer.from(encrypted, 'base64url');
  modified[20] ^= 1;
  assert.throws(() => decryptToken(modified.toString('base64url')));
  assert.ok(secretMatches('abc', 'abc'));
  assert.ok(!secretMatches('abc', 'abd'));
  assert.ok(!secretMatches('abc', undefined));
});
function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Participants');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
test('import Excel : accents, normalisation et doublons', () => {
  const data = workbook([
    ['Nom', 'Prénom', 'Email'],
    ['Dupont', 'Jean', 'JEAN@example.com'],
  ]);
  assert.equal(parseParticipants(data)[0].email, 'jean@example.com');
  assert.throws(
    () =>
      parseParticipants(
        workbook([
          ['Nom', 'Prénom', 'Email'],
          ['Dupont', 'Jean', 'pas-un-mail'],
        ]),
      ),
    /Ligne 2/,
  );
  assert.throws(
    () =>
      parseParticipants(
        workbook([
          ['Nom', 'Prénom', 'Email'],
          ['Dupont', 'Jean', 'jean@example.com'],
          ['Dupont', 'Jean', 'JEAN@example.com'],
        ]),
      ),
    /plusieurs fois/,
  );
  assert.throws(
    () =>
      parseParticipants(
        workbook([
          ['Nom', 'Courriel'],
          ['Dupont', 'jean@example.com'],
        ]),
      ),
    /colonnes/,
  );
});
test('import Excel : format, nombre de lignes et décompression bornés', () => {
  assert.throws(() => parseParticipants(Buffer.from('un fichier texte')), /xlsx/);
  const rows = Array.from({ length: 1001 }, (_, i) => ['Nom', 'Prénom', `p${i}@example.com`]);
  assert.throws(() => parseParticipants(workbook([['Nom', 'Prénom', 'Email'], ...rows])), /1 000/);
  const huge = Buffer.alloc(50);
  huge.writeUInt32LE(0x04034b50, 0);
  huge.writeUInt32LE(0x02014b50, 4);
  huge.writeUInt32LE(30_000_000, 28);
  assert.throws(() => parseParticipants(huge), /décompressé/);
});
