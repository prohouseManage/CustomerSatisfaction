import { defaultQuestions } from '../../src/lib/validation';
export const testOdooToken = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const testOdooUrl = `https://odoo.uat.houseoftraining.lu/session/satisfaction/${testOdooToken}`;
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function odooFixture() {
  return `<main><div><p>Session : Formation test ADR Formateur : Formateur Test</p>
    <form action="/session/satisfaction" method="post">
    <input name="access_token" value="${testOdooToken}"><input name="csrf_token" value="fresh-csrf">
    ${['Prénom', 'Nom', 'E-mail', ...defaultQuestions.map((q) => q.label)]
      .map(
        (label, index) =>
          `<div class="form-group row"><label>${index + 1} - ${escape(label)} (${index >= 3 && index < 14 ? 'obligatoire' : 'optionnel'})</label>
       <input name="${18 + index}" ${index >= 3 && index < 14 ? 'threshold="2"' : ''}>${index >= 3 && index < 14 ? [1, 2, 3, 4].map((n) => `<i class="js_star_rating" name="${n}"></i>`).join('') : ''}
       <textarea name="comment_${18 + index}"></textarea></div>`,
      )
      .join('')}
    </form></div></main>`;
}
export function odooEvaluationFixture() {
  const questions = defaultQuestions.map((q, i) => ({ ...q, id: `q-${i}` }));
  return {
    id: 'response-test',
    participant: { firstName: 'Jean', lastName: 'Dupont', email: 'jean@example.com' },
    questions,
    answers: questions.map((q, i) => ({
      questionId: q.id,
      value: i < 11 ? 4 : 'Test & amélioration',
      ...(i === 0 ? { comment: 'Très bien + merci' } : {}),
    })),
  };
}
