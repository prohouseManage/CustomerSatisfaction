import { ratingMax, type Answer } from './validation';

export const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function ratingSummary(answers: Answer[], types: Map<string, string>) {
  const ratings = answers.flatMap((answer) => {
    const max = ratingMax(types.get(answer.questionId) || '');
    return max &&
      typeof answer.value === 'number' &&
      Number.isFinite(answer.value) &&
      answer.value >= 1 &&
      answer.value <= max
      ? [(answer.value / max) * 4]
      : [];
  });
  const total = ratings.reduce((sum, value) => sum + value, 0);
  return {
    score: ratings.length ? rounded(total / ratings.length) : null,
    percent: ratings.length ? rounded((total / ratings.length / 4) * 100) : null,
    count: ratings.length,
  };
}
export function readableAnswers(answers: (Answer & { label: string })[]) {
  return answers
    .map((answer) => {
      const value = Array.isArray(answer.value)
        ? answer.value.join(', ')
        : typeof answer.value === 'boolean'
          ? answer.value
            ? 'Oui'
            : 'Non'
          : String(answer.value);
      return `${answer.label} : ${value}${answer.comment ? `\nCommentaire : ${answer.comment}` : ''}`;
    })
    .join('\n\n');
}
