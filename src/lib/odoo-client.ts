import { load } from 'cheerio';
import { hashToken } from './crypto';
import { defaultQuestions, type Answer } from './validation';
import { normalizeOdooUrl } from './odoo-url';

export const ODOO_ORIGIN = 'https://odoo.uat.houseoftraining.lu';
export type OdooConfig = {
  sourceSessionId: string;
  targetSessionId: string;
  url: string;
  sessionName: string;
  trainer: string;
  fingerprint: string;
};
export function odooConfig(): OdooConfig | null {
  if (process.env.ODOO_UAT_ENABLED !== 'true') return null;
  const url = process.env.ODOO_UAT_SATISFACTION_URL || '';
  const sourceSessionId = process.env.ODOO_UAT_SOURCE_SESSION_ID || '';
  const targetSessionId = process.env.ODOO_UAT_SESSION_ID || '';
  const sessionName = process.env.ODOO_UAT_SESSION_NAME || '';
  const trainer = process.env.ODOO_UAT_TRAINER || '';
  try {
    const parsed = new URL(url);
    if (
      parsed.origin !== ODOO_ORIGIN ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !/^\/session\/satisfaction\/[a-f\d-]{36}$/.test(parsed.pathname) ||
      !/^[A-Z0-9_-]{3,50}$/.test(sourceSessionId) ||
      !/^\d+$/.test(targetSessionId) ||
      !sessionName ||
      !trainer
    )
      return null;
    return {
      sourceSessionId,
      targetSessionId,
      url,
      sessionName,
      trainer,
      fingerprint: hashToken(
        JSON.stringify([sourceSessionId, targetSessionId, url, sessionName, trainer]),
      ),
    };
  } catch {
    return null;
  }
}
export class OdooError extends Error {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export function normalizeOdooLabel(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\s*\d+\s*-\s*/, '')
    .replace(/\((?:obligatoire|optionnel)\)\s*$/, '')
    .replace(/[^a-z0-9]/g, '');
}
export type OdooEvaluation = {
  id: string;
  participant: { firstName: string; lastName: string; email: string };
  questions: { id: string; label: string; type: string }[];
  answers: Answer[];
};
export function evaluationFields(evaluation: OdooEvaluation) {
  const fields: Record<string, string> = {
    '18': evaluation.participant.firstName,
    '19': evaluation.participant.lastName,
    '20': evaluation.participant.email,
  };
  const allowed = new Set<string>();
  for (const [index, standard] of defaultQuestions.entries()) {
    const matches = evaluation.questions.filter(
      (q) =>
        normalizeOdooLabel(q.label) === normalizeOdooLabel(standard.label) &&
        q.type === standard.type,
    );
    // Historical inactive questions may exist, but only answered ones are relevant.
    const answered = matches.filter((q) => evaluation.answers.some((a) => a.questionId === q.id));
    if (answered.length > 1 || (index < 11 && answered.length !== 1))
      throw new OdooError('Le questionnaire ne correspond pas aux onze notes Odoo sur quatre.');
    const question = answered[0];
    const answer = question && evaluation.answers.find((a) => a.questionId === question.id);
    if (question) allowed.add(question.id);
    const name = String(21 + index);
    if (
      index < 11 &&
      (typeof answer?.value !== 'number' ||
        !Number.isInteger(answer.value) ||
        answer.value < 1 ||
        answer.value > 4)
    )
      throw new OdooError('Une note Odoo doit être un entier entre 1 et 4.');
    if (index === 11 && answer && typeof answer.value !== 'string')
      throw new OdooError('Suggestions Odoo invalides.');
    if (
      index < 11 &&
      typeof answer?.value === 'number' &&
      answer.value <= 2 &&
      !answer.comment?.trim()
    )
      throw new OdooError(
        'Un commentaire est requis par le questionnaire Odoo pour une note de 1 ou 2 étoiles.',
      );
    fields[name] = String(answer?.value ?? '');
    fields[`comment_${name}`] = answer?.comment || '';
  }
  if (evaluation.answers.some((a) => !allowed.has(a.questionId)))
    throw new OdooError('Une réponse ne dispose pas de correspondance Odoo.');
  for (const id of ['18', '19', '20']) fields[`comment_${id}`] = '';
  return fields;
}
export function parseOdooForm(html: string, config: OdooConfig) {
  const $ = load(html);
  const form = $('form[action="/session/satisfaction"]');
  if (form.length !== 1 || form.attr('method')?.toLowerCase() !== 'post')
    throw new OdooError('Formulaire Odoo absent ou modifié.');
  const context = normalizeOdooLabel(form.parent().clone().children('form').remove().end().text());
  if (
    (config.sessionName && !context.includes(normalizeOdooLabel(config.sessionName))) ||
    (config.trainer && !context.includes(normalizeOdooLabel(config.trainer)))
  )
    throw new OdooError('La formation ou le formateur Odoo ne correspond pas à la configuration.');
  const accessToken = form.find('input[name="access_token"]').val();
  const csrfToken = form.find('input[name="csrf_token"]').val();
  if (
    typeof accessToken !== 'string' ||
    accessToken !== new URL(config.url).pathname.split('/').at(-1) ||
    typeof csrfToken !== 'string' ||
    !csrfToken
  )
    throw new OdooError('Jetons du formulaire Odoo invalides.');
  const expected = ['Prénom', 'Nom', 'E-mail', ...defaultQuestions.map((q) => q.label)];
  const numericFields = form
    .find('input[name],textarea[name],select[name]')
    .filter((_, e) => /^\d+$/.test($(e).attr('name') || ''));
  const fieldNames: Record<string, string> = {};
  for (const [index, label] of expected.entries()) {
    const field = numericFields.filter(
      (_, e) =>
        normalizeOdooLabel($(e).closest('.form-group.row').children('label').text()) ===
        normalizeOdooLabel(label),
    );
    const group = field.closest('.form-group.row');
    const name = field.attr('name') || '';
    if (field.length !== 1 || form.find(`[name="comment_${name}"]`).length !== 1)
      throw new OdooError(`Le champ Odoo ${18 + index} a changé. Aucun envoi effectué.`);
    if (
      index >= 3 &&
      index < 14 &&
      (field.attr('threshold') !== '2' ||
        group
          .find('.js_star_rating')
          .map((_, e) => $(e).attr('name'))
          .get()
          .join(',') !== '1,2,3,4')
    )
      throw new OdooError('Le barème Odoo a changé. Aucun envoi effectué.');
    fieldNames[String(18 + index)] = name;
  }
  if (numericFields.length !== 15 || new Set(Object.values(fieldNames)).size !== 15)
    throw new OdooError('Le nombre de questions Odoo a changé.');
  const header = form.parent().clone();
  header.find('form,script,style').remove();
  header.find('p,div,br,h1,h2,h3,h4').append(' ');
  const text = header.text().replace(/\s+/g, ' ').trim();
  const metadata = text.match(
    /Session\s*:\s*(.*?)\s*Formateur\s*:\s*(.*?)(?=\s+(?:ID|Identifiant|Référence)\s*(?:de\s+la\s+)?session\s*:|$)/i,
  );
  // Only explicit session metadata is authoritative. Numeric question IDs and the
  // UUID in the public URL do not identify the training session.
  const sessionIds = new Set<string>();
  const addSessionId = (value: unknown) => {
    if (typeof value === 'string' && /^[1-9]\d{0,49}$/.test(value.trim()))
      sessionIds.add(value.trim());
  };
  form.find('input[name="session_id"],input[name="training_session_id"]').each((_, node) => {
    addSessionId($(node).val());
  });
  addSessionId(form.attr('data-session-id'));
  addSessionId(form.parent().attr('data-session-id'));
  header.find('[data-session-id]').each((_, node) => addSessionId($(node).attr('data-session-id')));
  const explicitId = text.match(
    /(?:ID|Identifiant|Référence)\s*(?:de\s+la\s+)?session\s*:\s*(\d+)\b/i,
  );
  addSessionId(explicitId?.[1]);
  return {
    accessToken,
    csrfToken,
    fieldNames,
    sessionName: metadata?.[1]?.trim() || '',
    trainer: metadata?.[2]?.trim() || '',
    sessionId: sessionIds.size === 1 ? [...sessionIds][0] : null,
  };
}
function absorbCookies(jar: Map<string, string>, response: Response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0];
    const equals = pair.indexOf('=');
    if (equals > 0) jar.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
}
export function odooAcknowledged(value: unknown) {
  if (!value || typeof value !== 'object' || 'error' in value) return false;
  const result = 'result' in value ? value.result : null;
  return !!result && typeof result === 'object' && 'success' in result && result.success === true;
}
async function readOdooForm(config: OdooConfig, transport: typeof fetch) {
  try {
    normalizeOdooUrl(config.url);
  } catch {
    throw new OdooError('Lien Odoo invalide. Aucun envoi effectué.');
  }
  const jar = new Map<string, string>();
  let response: Response;
  try {
    response = await transport(config.url, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new OdooError('Lecture Odoo impossible. Aucun envoi effectué.');
  }
  if (!response.ok)
    throw new OdooError(`Lecture Odoo HTTP ${response.status}. Aucun envoi effectué.`);
  absorbCookies(jar, response);
  let html: string;
  try {
    html = await response.text();
  } catch {
    throw new OdooError('Lecture du formulaire Odoo interrompue.');
  }
  const tokens = parseOdooForm(html, config);
  if (!jar.has('session_id')) throw new OdooError('Cookie de session Odoo absent.');
  return { tokens, jar };
}
export async function inspectOdoo(config: OdooConfig, transport: typeof fetch = fetch) {
  const { tokens } = await readOdooForm(config, transport);
  return {
    sessionName: tokens.sessionName,
    trainer: tokens.trainer,
    sessionId: tokens.sessionId,
    questionCount: 12,
    environment: new URL(config.url).origin === ODOO_ORIGIN ? 'Préproduction' : 'Production',
  };
}
export async function prepareOdoo(
  config: OdooConfig,
  evaluation: OdooEvaluation,
  transport: typeof fetch = fetch,
) {
  const fields = evaluationFields(evaluation);
  const { tokens, jar } = await readOdooForm(config, transport);
  const mapped: Record<string, string> = {};
  for (const [canonical, actual] of Object.entries(tokens.fieldNames)) {
    mapped[actual] = fields[canonical];
    mapped[`comment_${actual}`] = fields[`comment_${canonical}`] || '';
  }
  const origin = new URL(config.url).origin;
  // The public website's evaluation.js sends flat JSON, not JSON-RPC params or HTML form encoding.
  const body = { ...mapped, access_token: tokens.accessToken, csrf_token: tokens.csrfToken };
  return {
    async send() {
      try {
        const response = await transport(`${origin}/session/satisfaction`, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(20000),
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Origin: origin,
            Referer: config.url,
            Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
            'Idempotency-Key': evaluation.id,
          },
          body: JSON.stringify(body),
        });
        absorbCookies(jar, response);
        const acknowledgement: unknown = await response.json().catch(() => null);
        if (!response.ok || !odooAcknowledged(acknowledgement))
          throw new OdooError(
            `Confirmation Odoo absente (HTTP ${response.status}). Vérifier dans Odoo avant tout nouvel envoi.`,
            true,
          );
        return { status: response.status, confirmed: true as const };
      } catch (error) {
        if (error instanceof OdooError) throw error;
        throw new OdooError(
          'Résultat de l’envoi Odoo incertain. Vérifier dans Odoo avant tout nouvel envoi.',
          true,
        );
      }
    },
  };
}
