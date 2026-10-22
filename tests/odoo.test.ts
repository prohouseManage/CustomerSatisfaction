import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluationFields,
  OdooError,
  parseOdooForm,
  prepareOdoo,
  odooAcknowledged,
  type OdooConfig,
  inspectOdoo,
} from '../src/lib/odoo-client';
import { isOdooUrl, normalizeOdooUrl } from '../src/lib/odoo-url';
import { odooFixture, odooEvaluationFixture, testOdooUrl } from './fixtures/odoo';
const config: OdooConfig = {
  sourceSessionId: '203238',
  targetSessionId: '203238',
  url: testOdooUrl,
  sessionName: 'Formation test ADR',
  trainer: 'Formateur Test',
  fingerprint: 'test',
};
test('Odoo : identité et onze notes associées aux libellés, indépendamment de leur ordre', () => {
  const evaluation = odooEvaluationFixture();
  evaluation.questions.reverse();
  evaluation.answers.reverse();
  const fields = evaluationFields(evaluation);
  assert.equal(fields['18'], 'Jean');
  assert.equal(fields['19'], 'Dupont');
  assert.equal(fields['21'], '4');
  assert.equal(fields['31'], '4');
  assert.equal(fields['32'], 'Test & amélioration');
  assert.equal(fields.comment_21, 'Très bien + merci');
  const low = odooEvaluationFixture();
  low.answers[1].value = 2;
  assert.throws(() => evaluationFields(low), /commentaire est requis/);
  low.answers[1].comment = 'Explications de la note.';
  assert.equal(evaluationFields(low)['22'], '2');
  evaluation.questions[2].label = 'Autre question';
  assert.throws(() => evaluationFields(evaluation), OdooError);
});
test('Odoo : refus avant POST si formation, token, libellé ou barème différents', () => {
  const html = odooFixture();
  assert.equal(parseOdooForm(html, config).csrfToken, 'fresh-csrf');
  for (const invalid of [
    html.replace('Formation test ADR', 'Autre formation'),
    html.replace('Formateur Test', 'Autre formateur'),
    html.replace('aaaaaaaa-bbbb', 'bbbbbbbb-bbbb'),
    html.replace('La formation correspondait', 'Autre question'),
    html.replace('<i class="js_star_rating" name="4"></i>', ''),
  ])
    assert.throws(() => parseOdooForm(invalid, config), OdooError);
});
test('Odoo : GET puis POST JSON plat comme evaluation.js, avec CSRF et même cookie HTTP', async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++;
    if (options?.method !== 'POST')
      return new Response(odooFixture(), {
        headers: { 'Set-Cookie': 'session_id=browser-session; Secure; HttpOnly' },
      });
    assert.equal(url, 'https://odoo.uat.houseoftraining.lu/session/satisfaction');
    const headers = new Headers(options.headers);
    assert.equal(headers.get('cookie'), 'session_id=browser-session');
    assert.equal(headers.get('content-type'), 'application/json');
    const fields = JSON.parse(String(options.body));
    assert.equal(fields.csrf_token, 'fresh-csrf');
    assert.equal(fields['18'], 'Jean');
    assert.equal(fields['19'], 'Dupont');
    assert.equal(fields.comment_21, 'Très bien + merci');
    assert.equal(fields['32'], 'Test & amélioration');
    assert.equal(fields.params, undefined);
    return Response.json({ result: { success: true } });
  };
  const prepared = await prepareOdoo(config, odooEvaluationFixture(), transport);
  assert.equal(calls, 1);
  assert.equal((await prepared.send()).confirmed, true);
  assert.equal(calls, 2);
});
test('Odoo : seul result.success=true sans erreur confirme une sauvegarde', async () => {
  assert.equal(odooAcknowledged(odooFixture()), false);
  assert.equal(odooAcknowledged('<main>Erreur serveur</main>'), false);
  assert.equal(odooAcknowledged({ success: true }), false);
  assert.equal(odooAcknowledged({ result: { success: false } }), false);
  assert.equal(
    odooAcknowledged({ result: { success: true }, error: { message: 'failed' } }),
    false,
  );
  assert.equal(odooAcknowledged({ result: { success: true } }), true);
  const prepared = await prepareOdoo(config, odooEvaluationFixture(), async (_, options) =>
    options?.method === 'POST'
      ? new Response(odooFixture())
      : new Response(odooFixture(), { headers: { 'Set-Cookie': 'session_id=test' } }),
  );
  await assert.rejects(prepared.send(), (e: unknown) => e instanceof OdooError && e.uncertain);
});
test('Odoo : panne après POST et redirection externe restent incertaines', async () => {
  for (const mode of ['timeout', 'redirect']) {
    const prepared = await prepareOdoo(config, odooEvaluationFixture(), async (_, options) => {
      if (options?.method !== 'POST')
        return new Response(odooFixture(), { headers: { 'Set-Cookie': 'session_id=test' } });
      if (mode === 'timeout') throw new Error('sensitive network details');
      return new Response(null, { status: 303, headers: { Location: 'https://example.com/' } });
    });
    await assert.rejects(
      prepared.send(),
      (e: unknown) => e instanceof OdooError && e.uncertain && !e.message.includes('sensitive'),
    );
  }
});
test('Odoo : liens HTTPS limités aux deux environnements House of Training', () => {
  assert.equal(normalizeOdooUrl(testOdooUrl + '/'), testOdooUrl);
  assert.equal(
    isOdooUrl(testOdooUrl.replace('odoo.uat.houseoftraining.lu', 'www.houseoftraining.lu')),
    true,
  );
  for (const invalid of [
    testOdooUrl.replace('https:', 'http:'),
    testOdooUrl.replace('odoo.uat.houseoftraining.lu', 'localhost'),
    testOdooUrl + '?next=1',
    testOdooUrl + '#fragment',
    testOdooUrl.replace('https://', 'https://user:password@'),
    testOdooUrl.replace('/session/satisfaction/', '/other/'),
    testOdooUrl.replace('odoo.uat.houseoftraining.lu', 'odoo.uat.houseoftraining.lu.example.org'),
  ])
    assert.equal(isOdooUrl(invalid), false);
});
test('Odoo : vérification en lecture seule et champs numériques découverts par libellé', async () => {
  const production = {
    ...config,
    url: testOdooUrl.replace('odoo.uat.houseoftraining.lu', 'www.houseoftraining.lu'),
    sessionName: '',
    trainer: '',
  };
  const html = odooFixture().replace(/name="(comment_)?(\d+)"/g, (original, comment, id) =>
    Number(id) < 18 ? original : `name="${comment || ''}${Number(id) + 200}"`,
  );
  let posts = 0;
  const transport: typeof fetch = async (url, options) => {
    if (options?.method !== 'POST')
      return new Response(html, { headers: { 'Set-Cookie': 'session_id=fresh' } });
    posts++;
    assert.equal(url, 'https://www.houseoftraining.lu/session/satisfaction');
    assert.equal(new Headers(options.headers).get('origin'), 'https://www.houseoftraining.lu');
    const body = JSON.parse(String(options.body));
    assert.equal(body['218'], 'Jean');
    assert.equal(body['219'], 'Dupont');
    assert.equal(body['221'], '4');
    assert.equal(body.comment_221, 'Très bien + merci');
    assert.equal(body['232'], 'Test & amélioration');
    assert.equal(body['18'], undefined);
    return Response.json({ result: { success: true } });
  };
  const information = await inspectOdoo(production, transport);
  assert.deepEqual(information, {
    sessionName: 'Formation test ADR',
    trainer: 'Formateur Test',
    sessionId: null,
    questionCount: 12,
    environment: 'Production',
  });
  assert.equal(posts, 0);
  assert.equal(JSON.stringify(information).includes('csrf'), false);
  await (await prepareOdoo(production, odooEvaluationFixture(), transport)).send();
  assert.equal(posts, 1);
});

test('Odoo : identifiant repris uniquement depuis une métadonnée de session explicite et cohérente', () => {
  const html = odooFixture();
  assert.equal(parseOdooForm(html, config).sessionId, null);
  for (const metadata of [
    '<input type="hidden" name="session_id" value="196408">',
    '<input type="hidden" name="training_session_id" value="196408">',
  ]) {
    assert.equal(
      parseOdooForm(html.replace('</form>', `${metadata}</form>`), config).sessionId,
      '196408',
    );
  }
  const explicit = html.replace('<div>', '<div data-session-id="196408">');
  assert.equal(parseOdooForm(explicit, config).sessionId, '196408');
  assert.equal(
    parseOdooForm(
      explicit.replace('</form>', '<input name="session_id" value="203238"></form>'),
      config,
    ).sessionId,
    null,
  );
  const labelled = html.replace('</p>', '</p><p>ID session : 196408</p>');
  const parsed = parseOdooForm(labelled, config);
  assert.equal(parsed.sessionId, '196408');
  assert.equal(parsed.trainer, 'Formateur Test');
  assert.equal(parsed.sessionName, 'Formation test ADR');
  const realStructure = html.replace(
    '<p>Session : Formation test ADR Formateur : Formateur Test</p>',
    '<div><p><strong>Session :</strong> <span>Formation test ADR</span></p></div><div><p><strong>Formateur :</strong> <span>Formateur Test</span></p></div>',
  );
  assert.equal(parseOdooForm(realStructure, config).trainer, 'Formateur Test');
  assert.equal(parseOdooForm(realStructure, config).sessionName, 'Formation test ADR');
  assert.equal(
    parseOdooForm(html.replace('Formation test ADR', 'Formation test ADR 196408'), config)
      .sessionId,
    null,
  );
});
