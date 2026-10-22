import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingSummary, readableAnswers } from '../src/lib/satisfaction-metrics';

test('note finale sur quatre et pourcentage : les anciens barèmes sont normalisés, les nombres et commentaires sont exclus', () => {
  const types = new Map([
    ['q4', 'RATING_4'],
    ['q5', 'RATING_5'],
    ['q10', 'RATING_10'],
    ['age', 'NUMBER'],
    ['text', 'LONG_TEXT'],
  ]);
  const score = ratingSummary(
    [
      { questionId: 'q4', value: 3, comment: 'Excellent' },
      { questionId: 'q5', value: 5 },
      { questionId: 'q10', value: 5 },
      { questionId: 'age', value: 99 },
      { questionId: 'text', value: 'Très utile' },
    ],
    types,
  );
  assert.deepEqual(score, { score: 3, percent: 75, count: 3 });
  assert.deepEqual(ratingSummary([], types), { score: null, percent: null, count: 0 });
  assert.deepEqual(
    ratingSummary(
      [
        { questionId: 'q4', value: 0 },
        { questionId: 'q4', value: Infinity },
      ],
      types,
    ),
    { score: null, percent: null, count: 0 },
  );
});
test('la note et le pourcentage sont arrondis séparément à partir des notes initiales', () => {
  assert.deepEqual(
    ratingSummary(
      [
        { questionId: 'q', value: 4 },
        { questionId: 'q', value: 4 },
        { questionId: 'q', value: 3 },
      ],
      new Map([['q', 'RATING_4']]),
    ),
    { score: 3.67, percent: 91.67, count: 3 },
  );
});
test('réponses lisibles pour SharePoint : choix multiples, oui/non et commentaires conservés', () => {
  assert.equal(
    readableAnswers([
      { questionId: '1', label: 'Choix', value: ['A', 'B'] },
      { questionId: '2', label: 'Recommanderiez-vous ?', value: true },
      { questionId: '3', label: 'Note', value: 4, comment: 'Très satisfait.' },
    ]),
    'Choix : A, B\n\nRecommanderiez-vous ? : Oui\n\nNote : 4\nCommentaire : Très satisfait.',
  );
});
