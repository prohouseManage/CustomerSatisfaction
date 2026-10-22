import { loadEnvConfig } from '@next/env';
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { templateInput, type PdfTemplateRecord } from '../src/lib/pdf-template';

loadEnvConfig(process.cwd());

async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || !process.env.DATABASE_URL) {
    throw new Error(
      'Les connexions et identifiants administrateur doivent être renseignés dans .env.local.',
    );
  }
  const existing = process.argv.includes('--existing');
  const port = existing ? undefined : await freePort();
  const url = existing
    ? process.env.NEXTAUTH_URL || 'http://localhost:3000'
    : `http://localhost:${port}`;
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('Cette vérification doit utiliser un serveur local.');
  }
  let serverOutput = '';
  const server = existing
    ? undefined
    : spawn(
        process.execPath,
        [resolve('node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', String(port)],
        {
          windowsHide: true,
          env: { ...process.env, NODE_ENV: 'development', NEXTAUTH_URL: url },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
  const collectOutput = (chunk: Buffer) => {
    // Never print environment secrets, even if a dependency includes them in an error.
    let message = chunk.toString();
    for (const value of Object.entries(process.env)
      .filter(([key, value]) => /SECRET|PASSWORD|KEY|DATABASE_URL|DIRECT_URL/.test(key) && value)
      .map(([, value]) => value!)) {
      message = message.split(value).join('[redacted]');
    }
    serverOutput = (serverOutput + message).slice(-6000);
  };
  server?.stdout?.on('data', collectOutput);
  server?.stderr?.on('data', collectOutput);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (server && server.exitCode !== null)
        throw new Error('Le serveur local de vérification n’a pas démarré. ' + serverOutput);
      try {
        const response = await fetch(`${url}/api/auth/csrf`, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Le serveur local de vérification est indisponible.');
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
      headless: true,
    });
    const context = await browser.newContext({ locale: 'fr-FR' });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.name));
    const anonymous = await context.request.get(`${url}/api/statistics`);
    assert.equal(anonymous.status(), 401, 'Les statistiques doivent exiger une connexion.');
    await page.goto(`${url}/login`);
    const submit = page.getByRole('button', { name: 'Se connecter', exact: true });
    assert.ok(await submit.isEnabled(), 'La page login doit détecter la configuration.');
    await page.getByLabel('Adresse e-mail').fill(email);
    try {
      await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    } catch {
      throw new Error('Le champ de mot de passe n’est pas accessible.');
    }
    await submit.click();
    await page.waitForURL('**/admin', { timeout: 45000 });
    await page.getByRole('heading', { name: 'Tableau de bord.' }).waitFor();
    const statistics = await context.request.get(`${url}/api/statistics`);
    assert.equal(
      statistics.status(),
      200,
      'Les statistiques doivent être accessibles après connexion.',
    );
    const stats = await statistics.json();
    assert.equal(typeof stats.sessions, 'number');
    const sessions = await context.request.get(`${url}/api/sessions`);
    assert.equal(sessions.status(), 200);
    if (process.argv.includes('--retention')) {
      const response = await context.request.get(`${url}/api/settings/retention`);
      assert.equal(response.status(), 200);
      const policy = await response.json();
      assert.equal(typeof policy.enabled, 'boolean');
      assert.ok(['DAYS', 'MONTHS', 'YEARS'].includes(policy.unit));
      const forbidden = await context.request.put(`${url}/api/settings/retention`, {
        headers: { Origin: 'https://example.com' },
        data: { enabled: true, value: 1, unit: 'DAYS' },
      });
      assert.equal(forbidden.status(), 403);
      await page.goto(`${url}/admin?view=settings`);
      await page.getByRole('heading', { name: 'Conservation des sessions archivées' }).waitFor();
      await page
        .getByRole('button', { name: 'Enregistrer la conservation', exact: true })
        .waitFor();
      await page.screenshot({ path: 'test-results/live-retention-settings.png', fullPage: true });
      const after = await (await context.request.get(`${url}/api/statistics`)).json();
      assert.equal(after.sessions, stats.sessions);
      assert.equal(after.participants, stats.participants);
      assert.equal(after.responses, stats.responses);
      console.log(
        'Conservation : paramètres accessibles, Origin protégé, aucune modification de règle ni suppression réelle.',
      );
    }
    if (process.argv.includes('--odoo')) {
      const statusResponse = await context.request.get(`${url}/api/sessions/203238/odoo`);
      assert.equal(statusResponse.status(), 200);
      const status = await statusResponse.json();
      assert.equal(status.configured, true);
      assert.equal(status.targetSessionId, '203238');
      assert.ok(status.sent >= 1);
      assert.equal(JSON.stringify(status).includes('/session/satisfaction/'), false);
      const forbidden = await context.request.post(`${url}/api/sessions/203238/odoo`, {
        headers: { Origin: 'https://example.com' },
      });
      assert.equal(forbidden.status(), 403);
      await page.goto(`${url}/admin?view=sessions&session=203238`);
      await page.getByRole('heading', { name: 'Envoi vers Odoo · Préproduction' }).waitFor();
      await page.getByRole('button', { name: 'Actualiser le suivi Odoo' }).click();
      await page.getByText('1 confirmé(s)', { exact: false }).waitFor();
      await page.screenshot({ path: 'test-results/odoo-session-suivi.png', fullPage: true });
      await page.goto(`${url}/admin/sessions/203238/preview`);
      const firstQuestion = page.locator('fieldset').first();
      await firstQuestion.getByRole('radio', { name: '2 étoiles sur 4', exact: true }).check();
      const comment = firstQuestion.getByRole('textbox');
      assert.equal(await comment.getAttribute('required'), '');
      await firstQuestion.getByRole('radio', { name: '4 étoiles sur 4', exact: true }).check();
      assert.equal(await comment.count(), 0);
      await page.goto(`${url}/admin?view=sessions&session=203238`);
      console.log(
        'Odoo UAT 203238 : suivi visible, envoi confirmé, protection Origin active. Aucun nouvel envoi effectué.',
      );
    }
    if (process.argv.includes('--pdf')) {
      const templatesResponse = await context.request.get(`${url}/api/pdf-templates`);
      assert.equal(templatesResponse.status(), 200, 'Les modèles PDF doivent être accessibles.');
      const templates: PdfTemplateRecord[] = await templatesResponse.json();
      assert.ok(templates.some((t) => t.id === 'hot-classic'));
      const withParticipants = (
        (await sessions.json()) as { id: string; _count: { participants: number } }[]
      ).find((s) => s._count.participants > 0);
      if (withParticipants) {
        const exportResponse = await context.request.get(
          `${url}/api/sessions/${encodeURIComponent(withParticipants.id)}/export?format=pdf`,
        );
        assert.equal(exportResponse.status(), 200, 'L’export PDF doit réussir.');
        const pdf = await PDFDocument.load(await exportResponse.body());
        assert.equal(
          pdf.getPageCount(),
          withParticipants._count.participants,
          'Une page PDF par participant est requise.',
        );
        console.log(
          `Export Supabase : ${pdf.getPageCount()} participant(s), ${pdf.getPageCount()} page(s) A4.`,
        );
      }
      const preview = await context.request.post(`${url}/api/pdf-templates/preview`, {
        headers: { Origin: url },
        data: { template: templateInput(templates[0]) },
      });
      assert.equal(preview.status(), 200);
      assert.equal((await PDFDocument.load(await preview.body())).getPageCount(), 1);
      const afterExport = await (await context.request.get(`${url}/api/statistics`)).json();
      assert.equal(afterExport.participants, stats.participants);
      assert.equal(afterExport.responses, stats.responses);
      console.log('Modèles PDF et aperçu : accessibles ; aucune réponse participant consommée.');
    }
    console.log('Connexion depuis /login avec le compte Supabase : validée.');
    console.log('Tableau de bord et API administrateur : accessibles après connexion.');
    const auth = await context.request.get(`${url}/api/auth/session`);
    const session = await auth.json();
    assert.equal(session.user.email, email);
    await page.getByLabel('Se déconnecter', { exact: true }).click();
    await page.waitForURL('**/login');
    const afterLogout = await context.request.get(`${url}/api/statistics`);
    assert.equal(afterLogout.status(), 401);
    assert.deepEqual(pageErrors, []);
    console.log('Déconnexion et refus de l’accès après déconnexion : validés.');
  } finally {
    if (browser) await browser.close();
    if (server?.pid) {
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } catch {}
      } else server.kill('SIGTERM');
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'La vérification a échoué.');
  process.exitCode = 1;
});
