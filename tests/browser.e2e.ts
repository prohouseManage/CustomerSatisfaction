import { chromium } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { hash } from 'bcryptjs';
import * as XLSX from 'xlsx';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString } from 'pdf-lib';
import { templateInput, type PdfTemplateInput } from '../src/lib/pdf-template';
import { testOdooUrl, testOdooToken } from './fixtures/odoo';
import { emailDueDate, luxembourgDate } from '../src/lib/email-policy';

async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

async function main() {
  const root = resolve('.test-postgres'),
    directory = resolve(root, randomUUID());
  assert.ok(directory.startsWith(root + sep));
  const password = randomBytes(20).toString('hex'),
    url = 'http://localhost:3101';
  const pgPort = await freePort();
  let pgOutput = '';
  const pg = new EmbeddedPostgres({
    databaseDir: directory,
    user: 'postgres',
    password,
    port: pgPort,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'io_method=sync'],
    persistent: false,
    onLog: (message) => {
      pgOutput = (pgOutput + message).slice(-4000);
    },
    onError: () => {},
  });
  let started = false,
    server: ReturnType<typeof spawn> | undefined,
    browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
    db: PrismaClient | undefined;
  try {
    await pg.initialise();
    try {
      await pg.start();
    } catch {
      throw new Error('PostgreSQL de test : ' + pgOutput);
    }
    started = true;
    const connection = `postgresql://postgres:${password}@localhost:${pgPort}/postgres?connection_limit=8`;
    const client = pg.getPgClient('postgres', 'localhost');
    await client.connect();
    try {
      for (const dir of readdirSync(resolve('prisma/migrations'))
        .filter((n) => /^\d/.test(n))
        .sort())
        await client.query(
          readFileSync(resolve('prisma/migrations', dir, 'migration.sql'), 'utf8'),
        );
    } finally {
      await client.end();
    }
    db = new PrismaClient({ datasourceUrl: connection });
    const loginPassword = randomBytes(18).toString('hex');
    await db.admin.create({
      data: {
        email: 'admin@example.com',
        name: 'Admin Test',
        passwordHash: await hash(loginPassword, 12),
      },
    });
    let output = '';
    server = spawn(
      process.execPath,
      [resolve('node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', '3101'],
      {
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          DATABASE_URL: connection,
          DIRECT_URL: connection,
          NEXTAUTH_URL: url,
          NEXTAUTH_SECRET: randomBytes(32).toString('hex'),
          TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
          POWER_AUTOMATE_WEBHOOK_URL: '',
          ODOO_UAT_ENABLED: 'false',
          SMTP_USER: '',
          SMTP_PASSWORD: '',
          EMAIL_FROM: '',
          CRON_SECRET: randomBytes(32).toString('hex'),
          ENABLE_DEMO: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout?.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-12000);
    });
    server.stderr?.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-12000);
    });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try {
        const response = await fetch(`${url}/api/openapi`, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error('Serveur de test indisponible : ' + output);
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        locale: 'fr-FR',
      }),
      page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    mkdirSync(resolve('test-results'), { recursive: true });
    await page.goto(`${url}/demo`);
    await page.getByRole('heading', { name: 'Tableau de bord.' }).waitFor();
    await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
    assert.ok(
      await page
        .locator('.brand img')
        .first()
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/dashboard-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
      console.log(
        await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll('*')]
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              right: e.getBoundingClientRect().right,
              width: e.getBoundingClientRect().width,
            }))
            .filter((e) => e.right > innerWidth + 1)
            .slice(0, 18),
        })),
      );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'Le tableau de bord déborde horizontalement sur mobile.',
    );
    await page.getByLabel('Ouvrir la navigation').click();
    await page.getByRole('button', { name: 'Rapports & analyses' }).click();
    await page.getByRole('heading', { name: 'Rapports & analyses.' }).waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${url}/login`);
    await page.getByLabel('Adresse e-mail').fill('admin@example.com');
    await page.getByLabel('Mot de passe', { exact: true }).fill(loginPassword);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL('**/admin');
    await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
    await page.getByRole('heading', { name: 'Conservation des sessions archivées' }).waitFor();
    const retentionLoaded = page.getByRole('button', {
      name: 'Enregistrer la conservation',
      exact: true,
    });
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].find((b) =>
          b.textContent?.includes('Enregistrer la conservation'),
        )?.disabled,
    );
    await page.getByLabel('Délai après archivage', { exact: true }).fill('3');
    await page.getByLabel('Unité du délai', { exact: true }).selectOption('YEARS');
    await page.getByLabel('Activer la suppression automatique des sessions archivées').check();
    await retentionLoaded.click();
    await page
      .getByRole('status')
      .filter({ hasText: 'La règle de conservation a été enregistrée.' })
      .waitFor();
    const savedRetention = await db.retentionSettings.findUniqueOrThrow({
      where: { id: 'retention' },
    });
    assert.equal(savedRetention.enabled, true);
    assert.equal(savedRetention.value, 3);
    assert.equal(savedRetention.unit, 'YEARS');
    await page.screenshot({ path: 'test-results/settings-retention.png', fullPage: true });
    await db.automationRun.create({
      data: {
        status: 'PARTIAL',
        finishedAt: new Date(),
        steps: [
          {
            name: 'Envoi des e-mails',
            status: 'FAILED',
            summary: 'Erreur de démonstration sans envoi réel.',
          },
        ],
      },
    });
    const automationButton = page.getByRole('button', { name: 'Automatisations', exact: true });
    const settingsButton = page.getByRole('button', { name: 'Paramètres', exact: true });
    assert.equal(
      (await automationButton.boundingBox())?.x,
      (await settingsButton.boundingBox())?.x,
    );
    await automationButton.click();
    await page.getByRole('heading', { name: 'Suivi des automatisations', exact: true }).waitFor();
    await page.getByText('Terminée avec erreurs', { exact: true }).waitFor();
    await page.getByText('Voir les étapes', { exact: true }).click();
    await page.getByText(/Erreur de démonstration sans envoi réel/).waitFor();
    await page.screenshot({ path: 'test-results/automatisations-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/automatisations-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].find((b) =>
          b.textContent?.includes('Enregistrer la conservation'),
        )?.disabled,
    );
    await page.getByLabel('Activer la suppression automatique des sessions archivées').uncheck();
    await page.getByLabel('Délai après archivage', { exact: true }).fill('2');
    await page.getByLabel('Unité du délai', { exact: true }).selectOption('MONTHS');
    const retentionSaved = page.waitForResponse(
      (r) => r.url().endsWith('/api/settings/retention') && r.request().method() === 'PUT',
    );
    await retentionLoaded.click();
    assert.equal((await retentionSaved).status(), 200);
    for (const format of ['schema', 'example']) {
      const artifact = await page.request.get(
        `${url}/api/integrations/powerautomate?format=${format}`,
      );
      assert.equal(artifact.status(), 200);
      const value = await artifact.json();
      assert.equal(
        format === 'schema' ? value.properties.schemaVersion.enum[0] : value.schemaVersion,
        2,
      );
    }
    await page.getByRole('button', { name: 'Modèles PDF', exact: true }).click();
    await page.getByRole('button', { name: 'Personnaliser', exact: true }).first().click();
    const templateDialog = page.getByRole('dialog');
    await templateDialog
      .getByLabel('Nom du modèle', { exact: true })
      .fill('Invitation personnalisée test');
    await templateDialog
      .getByLabel('Titre du document')
      .fill('Merci pour votre retour, {{prenom}}');
    await page.evaluate(() => {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        (window as unknown as { pdfBlobSize: number }).pdfBlobSize =
          blob instanceof Blob ? blob.size : 0;
        return original(blob);
      };
    });
    const previewResponse = page.waitForResponse(
      (r) => r.url().endsWith('/api/pdf-templates/preview') && r.request().method() === 'POST',
    );
    await templateDialog.getByRole('button', { name: 'Aperçu PDF', exact: true }).click();
    const preview = await previewResponse;
    assert.equal(preview.status(), 200);
    await templateDialog.getByTitle('Aperçu du modèle PDF').waitFor();
    const previewBlobSize = await page.evaluate(
      () => (window as unknown as { pdfBlobSize: number }).pdfBlobSize,
    );
    assert.ok(
      previewBlobSize > 1000,
      `L’aperçu reçu dans le navigateur est vide : ${previewBlobSize} octets.`,
    );
    // Chromium's native PDF viewer may consume the CDP response body; verify the server bytes independently.
    const previewDownload = await page.request.post(`${url}/api/pdf-templates/preview`, {
      headers: { Origin: url },
      data: {
        template: {
          ...templateInput((await (await page.request.get(`${url}/api/pdf-templates`)).json())[0]),
          heading: 'Merci pour votre retour, {{prenom}}',
        },
      },
    });
    const previewBytes = await previewDownload.body();
    assert.equal(
      previewBytes.subarray(0, 4).toString(),
      '%PDF',
      `Aperçu : ${preview.headers()['content-type']}, ${previewBytes.subarray(0, 160).toString()}`,
    );
    const previewPdf = await PDFDocument.load(previewBytes);
    assert.equal(previewPdf.getPageCount(), 1);
    const previewAnnotation = previewPdf
      .getPage(0)
      .node.lookup(PDFName.of('Annots'), PDFArray)
      .lookup(0, PDFDict);
    assert.equal(
      previewAnnotation
        .lookup(PDFName.of('A'), PDFDict)
        .lookup(PDFName.of('URI'), PDFString)
        .decodeText(),
      `${url}/demo/form`,
    );
    await templateDialog.getByTitle('Aperçu du modèle PDF').waitFor();
    await templateDialog.screenshot({ path: 'test-results/pdf-template-editor.png' });
    await templateDialog
      .getByRole('button', { name: 'Enregistrer le modèle', exact: true })
      .click();
    await templateDialog.waitFor({ state: 'hidden' });
    const savedTemplate = await db.pdfTemplate.findFirstOrThrow({
      where: { name: 'Invitation personnalisée test' },
    });
    const templateCard = page.locator('.pdf-template-card').filter({
      has: page.getByRole('heading', { name: 'Invitation personnalisée test', exact: true }),
    });
    await templateCard.getByRole('button', { name: 'Modifier', exact: true }).click();
    await page.getByLabel('Nom du modèle', { exact: true }).fill('Invitation test modifiée');
    await page.getByRole('button', { name: 'Enregistrer le modèle', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Invitation test modifiée', exact: true }).waitFor();
    assert.equal(
      (await db.pdfTemplate.findUniqueOrThrow({ where: { id: savedTemplate.id } })).name,
      'Invitation test modifiée',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/pdf-templates-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /^Sessions de formation/ }).click();
    await page.getByRole('button', { name: 'Nouvelle session', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nom de la formation').fill('Formation de validation');
    await dialog.getByLabel('Identifiant unique').fill('E2E-2026-001');
    assert.equal(
      await dialog.getByLabel('Langue initiale du questionnaire', { exact: true }).inputValue(),
      'fr',
    );
    await dialog
      .getByLabel('Langue initiale du questionnaire', { exact: true })
      .selectOption('auto');
    await dialog.getByLabel('Date de début', { exact: true }).fill('2026-12-11');
    assert.equal(await dialog.locator('input[name="endDate"]').inputValue(), '2026-12-11');
    await dialog.locator('input[name="endDate"]').fill('2026-12-14');
    await dialog.getByLabel('Formateur', { exact: true }).fill('Jean Dupont');
    await dialog.screenshot({ path: 'test-results/session-dates-creation.png' });
    await dialog.locator('select[name="status"]').selectOption('ACTIVE');
    await dialog.getByLabel('Lien du questionnaire Odoo', { exact: true }).fill(testOdooUrl);
    await dialog.getByRole('button', { name: 'Créer la session', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /Formation de validation.*E2E-2026-001/ }).click();
    await page.getByRole('heading', { name: 'Formation de validation.' }).waitFor();
    await page.getByRole('heading', { name: 'Envoi vers Odoo · Préproduction' }).waitFor();
    const savedConnection = await db.odooConnection.findUniqueOrThrow({
      where: { sessionId: 'E2E-2026-001' },
    });
    assert.equal(savedConnection.enabled, true);
    assert.equal(savedConnection.urlEncrypted.includes(testOdooToken), false);
    const publicAdminSession = await (
      await page.request.get(`${url}/api/sessions/E2E-2026-001`)
    ).json();
    assert.equal(JSON.stringify(publicAdminSession).includes(testOdooToken), false);
    assert.equal(publicAdminSession.endDate.slice(0, 10), '2026-12-14');
    assert.equal(publicAdminSession.formLanguage, 'auto');
    const emailScheduleStatus = await (
      await page.request.get(`${url}/api/sessions/E2E-2026-001/emails`)
    ).json();
    assert.equal(emailScheduleStatus.dueDate, '2026-12-15');
    const invalidDates = await page.request.patch(`${url}/api/sessions/E2E-2026-001`, {
      headers: { Origin: url },
      data: { ...publicAdminSession, date: '2026-12-11', endDate: '2026-12-10' },
    });
    assert.equal(invalidDates.status(), 400);
    const safeStatus = await (
      await page.request.get(`${url}/api/sessions/E2E-2026-001/odoo`)
    ).json();
    assert.equal(safeStatus.configured, true);
    assert.equal('url' in safeStatus, false);
    const forbiddenVerify = await page.request.post(`${url}/api/odoo/verify`, {
      headers: { Origin: url },
      data: { url: 'http://localhost:1234/secret' },
    });
    assert.equal(forbiddenVerify.status(), 400);
    await page.getByRole('button', { name: 'Configurer le lien Odoo', exact: true }).click();
    await page.waitForFunction(
      () => !(document.querySelector('input[name="odooUrl"]') as HTMLInputElement)?.disabled,
    );
    assert.equal(
      await dialog.getByLabel('Lien du questionnaire Odoo', { exact: true }).inputValue(),
      testOdooUrl,
    );
    await dialog.screenshot({ path: 'test-results/session-odoo-editor.png' });
    const productionTestUrl = testOdooUrl.replace(
      'odoo.uat.houseoftraining.lu',
      'www.houseoftraining.lu',
    );
    await dialog.getByLabel('Lien du questionnaire Odoo', { exact: true }).fill(productionTestUrl);
    await dialog.getByLabel('Activer l’envoi automatique des évaluations vers Odoo').uncheck();
    await dialog
      .getByRole('button', { name: 'Enregistrer les modifications', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
    const editedOdoo = await (
      await page.request.get(`${url}/api/sessions/E2E-2026-001/odoo?includeUrl=true`)
    ).json();
    assert.equal(editedOdoo.url, productionTestUrl);
    assert.equal(editedOdoo.enabled, false);
    assert.equal(
      (
        await page.request.post(`${url}/api/sessions/E2E-2026-001/odoo`, {
          headers: { Origin: url },
        })
      ).status(),
      400,
    );
    await page.getByRole('button', { name: 'Importer des participants', exact: true }).click();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { Nom: 'Dupont', Prénom: 'Jean', Email: 'jean@example.com' },
        { Nom: 'Martin', Prénom: 'Marie', Email: 'marie@example.com' },
      ]),
      'Participants',
    );
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await page.getByLabel('Fichier Excel des participants').setInputFiles({
      name: 'participants.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });
    await page.getByRole('button', { name: 'Importer et générer les liens', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Lien & QR Code' }).first().waitFor();
    const list = await page.request.get(`${url}/api/participants?sessionId=E2E-2026-001`);
    const listBody = await list.json();
    assert.equal(listBody.total, 2);
    assert.ok(!JSON.stringify(listBody).includes('token'));
    const session = await (await page.request.get(`${url}/api/sessions/E2E-2026-001`)).json();
    const edit = await page.request.patch(`${url}/api/sessions/E2E-2026-001`, {
      headers: { Origin: url },
      data: {
        ...session,
        date: session.date.slice(0, 10),
        endDate: session.endDate.slice(0, 10),
        questions: session.questions.map((q: Record<string, unknown>, i: number) => ({
          ...q,
          label: i === 0 ? 'Question modifiée' : q.label,
        })),
      },
    });
    assert.equal(edit.status(), 409);
    const translated = await page.request.patch(`${url}/api/sessions/E2E-2026-001`, {
      headers: { Origin: url },
      data: {
        ...session,
        date: session.date.slice(0, 10),
        endDate: session.endDate.slice(0, 10),
        questions: session.questions.map((q: Record<string, unknown>, index: number) =>
          index === 0
            ? { ...q, translations: { en: { label: 'The course met my expectations.' } } }
            : q,
        ),
      },
    });
    assert.equal(translated.status(), 200);
    assert.equal((await translated.json()).questions[0].id, session.questions[0].id);
    const csrf = await page.request.post(`${url}/api/sessions`, {
      headers: { Origin: 'https://example.invalid' },
      data: {},
    });
    assert.equal(csrf.status(), 403);
    for (const format of ['xlsx', 'pdf']) {
      const links = await page.request.get(
        `${url}/api/sessions/E2E-2026-001/export?format=${format}`,
      );
      assert.equal(links.status(), 200);
      const contents = await links.body();
      assert.equal(
        contents.subarray(0, format === 'pdf' ? 4 : 2).toString(),
        format === 'pdf' ? '%PDF' : 'PK',
      );
      if (format === 'pdf') assert.equal((await PDFDocument.load(contents)).getPageCount(), 2);
    }
    const modelSaved = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/sessions/E2E-2026-001/pdf-template') &&
        r.request().method() === 'PUT',
    );
    await page
      .getByLabel('Modèle PDF de cette session', { exact: true })
      .selectOption(savedTemplate.id);
    assert.equal((await modelSaved).status(), 200);
    assert.equal(
      (await db.trainingSession.findUniqueOrThrow({ where: { id: session.id } })).pdfTemplateId,
      savedTemplate.id,
    );
    assert.equal(
      (
        await page.request.delete(`${url}/api/pdf-templates/${savedTemplate.id}`, {
          headers: { Origin: url },
        })
      ).status(),
      409,
    );
    await page.reload();
    await page.getByLabel('Modèle PDF de cette session', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Modèle PDF de cette session', { exact: true }).inputValue(),
      savedTemplate.id,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/session-pdf-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: 'test-results/session-pdf-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });
    const other = await db.trainingSession.create({
      data: { id: 'E2E-OTHER', name: 'Autre session', date: new Date(), trainer: 'Test' },
    });
    const otherChoice = await page.request.put(`${url}/api/sessions/${other.id}/pdf-template`, {
      headers: { Origin: url },
      data: { templateId: 'hot-banner' },
    });
    assert.equal(otherChoice.status(), 200);
    assert.equal((await otherChoice.json()).pdfPreset, 'hot-banner');
    assert.equal(
      (await db.trainingSession.findUniqueOrThrow({ where: { id: session.id } })).pdfTemplateId,
      savedTemplate.id,
    );
    await db.trainingSession.delete({ where: { id: other.id } });
    assert.equal(
      (
        await page.request.put(`${url}/api/sessions/${session.id}/pdf-template`, {
          headers: { Origin: url },
          data: { templateId: 'missing' },
        })
      ).status(),
      404,
    );
    assert.equal(
      (
        await page.request.put(`${url}/api/sessions/${session.id}/pdf-template`, {
          headers: { Origin: 'https://invalid.example' },
          data: { templateId: 'hot-banner' },
        })
      ).status(),
      403,
    );
    const downloadPromise = page.waitForEvent('download');
    const exportResponse = page.waitForResponse((r) =>
      r.url().endsWith('/api/sessions/E2E-2026-001/export?format=pdf'),
    );
    await page
      .getByRole('button', { name: 'Télécharger toutes les fiches PDF', exact: true })
      .click();
    assert.equal((await exportResponse).status(), 200);
    const invitationDownload = await downloadPromise;
    assert.equal(invitationDownload.suggestedFilename(), 'qr-E2E-2026-001.pdf');
    const invitationBytes = readFileSync((await invitationDownload.path())!);
    assert.equal(
      invitationBytes.subarray(0, 4).toString(),
      '%PDF',
      `Téléchargement : ${invitationBytes.subarray(0, 160).toString()}`,
    );
    const exportedPdf = await PDFDocument.load(invitationBytes);
    assert.equal(exportedPdf.getPageCount(), 2);
    const exportedLinks = exportedPdf
      .getPages()
      .map((p) =>
        p.node
          .lookup(PDFName.of('Annots'), PDFArray)
          .lookup(0, PDFDict)
          .lookup(PDFName.of('A'), PDFDict)
          .lookup(PDFName.of('URI'), PDFString)
          .decodeText(),
      );
    assert.equal(new Set(exportedLinks).size, 2);
    assert.ok(exportedLinks.every((link) => link.startsWith(`${url}/form/E2E-2026-001/`)));
    assert.equal(
      (
        await page.request.get(
          `${url}/api/sessions/E2E-2026-001/export?format=pdf&templateId=missing`,
        )
      ).status(),
      404,
    );
    assert.equal(
      (
        await page.request.put(`${url}/api/pdf-templates/hot-classic`, {
          headers: { Origin: url },
          data: templateInput(savedTemplate as PdfTemplateInput),
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await page.request.post(`${url}/api/pdf-templates`, {
          headers: { Origin: 'https://invalid.example' },
          data: {},
        })
      ).status(),
      403,
    );
    await page.getByRole('button', { name: 'Lien & QR Code' }).first().click();
    const personalLink = await page.getByLabel('Lien du questionnaire').inputValue();
    await page.getByRole('dialog').getByLabel('Fermer', { exact: true }).click();
    // Isolate the browser-language phase from the earlier API/export robot traffic.
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'admin:' } } });
    const currentLanguageSession = await (
      await page.request.get(`${url}/api/sessions/${session.id}`)
    ).json();
    const languageBody = {
      ...currentLanguageSession,
      date: currentLanguageSession.date.slice(0, 10),
      endDate: currentLanguageSession.endDate.slice(0, 10),
    };
    assert.equal(
      (
        await page.request.patch(`${url}/api/sessions/${session.id}`, {
          headers: { Origin: url },
          data: { ...languageBody, formLanguage: 'de' },
        })
      ).status(),
      200,
    );
    const fixedLanguage = await browser.newContext({ locale: 'fr-FR' });
    const fixedPage = await fixedLanguage.newPage();
    await fixedPage.goto(personalLink);
    await fixedPage
      .getByRole('heading', { name: 'Wie können wir noch besser werden?', exact: true })
      .waitFor();
    await fixedLanguage.close();
    assert.equal(
      (
        await page.request.patch(`${url}/api/sessions/${session.id}`, {
          headers: { Origin: url },
          data: { ...languageBody, formLanguage: 'auto' },
        })
      ).status(),
      200,
    );
    for (const [locale, title] of [
      ['de-DE', 'Wie können wir noch besser werden?'],
      ['es-ES', 'How can we make things even better?'],
      ['en-GB', 'How can we make things even better?'],
    ] as const) {
      const languageVisitor = await browser.newContext({ locale });
      const languagePage = await languageVisitor.newPage();
      await languagePage.goto(personalLink);
      await languagePage.getByRole('heading', { name: title, exact: true }).waitFor();
      if (locale === 'es-ES') {
        await languagePage.goto(`${personalLink}?lang=fr`);
        await languagePage
          .getByRole('heading', { name: 'Et si on faisait encore mieux ?', exact: true })
          .waitFor();
      }
      await languageVisitor.close();
    }
    const visitor = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: 'fr-FR',
      }),
      form = await visitor.newPage();
    form.on('pageerror', (e) => pageErrors.push(e.message));
    assert.equal((await visitor.request.get(`${url}/api/participants`)).status(), 401);
    assert.equal((await visitor.request.get(`${url}/api/automations`)).status(), 401);
    assert.equal((await visitor.request.get(`${url}/api/pdf-templates`)).status(), 401);
    assert.equal(
      (await visitor.request.get(`${url}/api/integrations/powerautomate`)).status(),
      401,
    );
    await form.goto(personalLink);
    await form.getByRole('heading', { name: 'Et si on faisait encore mieux ?' }).waitFor();
    const stale = await visitor.newPage();
    await stale.goto(personalLink);
    assert.equal(
      await form.locator('input[type=email],input[name=firstName],input[name=lastName]').count(),
      0,
    );
    assert.equal(await form.locator('.star-rating').count(), 11);
    assert.equal(await form.locator('.star-rating input').count(), 44);
    for (let i = 0; i < 11; i++)
      await form
        .locator('.star-rating')
        .nth(i)
        .getByRole('radio', { name: '4 étoiles sur 4', exact: true })
        .check();
    await form
      .getByLabel('Suggestions d’amélioration', { exact: true })
      .fill('Une formation très utile.');
    await form.getByRole('button', { name: 'Ajouter un commentaire', exact: true }).first().click();
    await form
      .getByRole('textbox', {
        name: 'Commentaire : La formation correspondait globalement à mes attentes',
        exact: true,
      })
      .fill('Très satisfait du contenu.');
    await form.getByLabel('Langue / Sprache / Language', { exact: true }).selectOption('en');
    await form
      .getByRole('heading', { name: 'How can we make things even better?', exact: true })
      .waitFor();
    assert.equal(
      await form.getByLabel('Suggestions for improvement', { exact: true }).inputValue(),
      'Une formation très utile.',
    );
    assert.equal(
      await form
        .getByLabel('Comment : The course met my expectations.', { exact: true })
        .inputValue(),
      'Très satisfait du contenu.',
    );
    assert.equal(
      await form.getByRole('radio', { name: '4 stars out of 4', exact: true }).first().isChecked(),
      true,
    );
    await form.screenshot({ path: 'test-results/participant-english-mobile.png', fullPage: true });
    assert.ok(await form.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await form.reload();
    await form
      .getByRole('heading', { name: 'How can we make things even better?', exact: true })
      .waitFor();
    // A reload does not save unsent answers; language switches within the form do.
    await form.getByLabel('Langue / Sprache / Language', { exact: true }).selectOption('de');
    await form
      .getByRole('heading', { name: 'Wie können wir noch besser werden?', exact: true })
      .waitFor();
    await form.screenshot({ path: 'test-results/participant-german-mobile.png', fullPage: true });
    await form.getByLabel('Langue / Sprache / Language', { exact: true }).selectOption('fr');
    for (let i = 0; i < 11; i++)
      await form
        .locator('.star-rating')
        .nth(i)
        .getByRole('radio', { name: '4 étoiles sur 4', exact: true })
        .check();
    await form
      .getByLabel('Suggestions d’amélioration', { exact: true })
      .fill('Une formation très utile.');
    await form.getByRole('button', { name: 'Ajouter un commentaire', exact: true }).first().click();
    await form
      .getByLabel('Commentaire : La formation correspondait globalement à mes attentes', {
        exact: true,
      })
      .fill('Très satisfait du contenu.');
    await form.screenshot({ path: 'test-results/participant-mobile.png', fullPage: true });
    assert.ok(await form.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const token = new URL(personalLink).pathname.split('/').pop();
    assert.equal(
      await form.locator('form').evaluate((node: HTMLFormElement) => node.checkValidity()),
      true,
      'Le formulaire rempli doit être valide.',
    );
    const [submission] = await Promise.all([
      form.waitForResponse(
        (response) =>
          response.url() === `${url}/api/submit` && response.request().method() === 'POST',
      ),
      form.getByRole('button', { name: 'Envoyer mon avis', exact: true }).click(),
    ]);
    assert.equal(submission.status(), 201, JSON.stringify(await submission.json()));
    await form.getByRole('heading', { name: 'Merci pour votre retour !' }).waitFor();
    const second = await form.request.post(`${url}/api/submit`, {
      headers: { Origin: url },
      data: { sessionId: session.id, token, answers: [] },
    });
    assert.equal(second.status(), 409);
    for (let i = 0; i < 11; i++)
      await stale
        .locator('.star-rating')
        .nth(i)
        .getByRole('radio', { name: '4 étoiles sur 4', exact: true })
        .check();
    await stale.getByRole('button', { name: 'Envoyer mon avis', exact: true }).click();
    await stale.getByRole('heading', { name: 'Ce questionnaire a déjà été complété.' }).waitFor();
    assert.equal(await stale.locator('form').count(), 0);
    const revisited = await visitor.newPage();
    await revisited.goto(personalLink);
    await revisited
      .getByRole('heading', { name: 'Ce questionnaire a déjà été complété.' })
      .waitFor();
    assert.equal(await revisited.locator('form').count(), 0);
    await revisited.getByLabel('Langue / Sprache / Language', { exact: true }).selectOption('en');
    await revisited
      .getByRole('heading', { name: 'This questionnaire has already been completed.', exact: true })
      .waitFor();
    assert.equal(await db.response.count(), 1);
    assert.equal(await db.webhookDelivery.count(), 1);
    const saved = await db.response.findFirstOrThrow();
    assert.equal(
      (saved.answers as { comment?: string }[])[0].comment,
      'Très satisfait du contenu.',
    );
    const outbox = await db.webhookDelivery.findFirstOrThrow();
    assert.equal(
      (outbox.payload as { answers: { comment?: string }[] }).answers[0].comment,
      'Très satisfait du contenu.',
    );
    // This phase uses only the disposable E2E database, with no SMTP or Odoo submission.
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'admin:' } } });
    await page.goto(`${url}/admin?view=reports`);
    await page.getByRole('heading', { name: 'Sessions du périmètre' }).waitFor();
    await page.getByLabel('Période de formation', { exact: true }).selectOption('day');
    const filteredStats = page.waitForResponse(
      (response) =>
        response.url().includes('/api/statistics?') &&
        response.url().includes('dateFrom=2026-12-12'),
    );
    await page.getByLabel('Date de formation', { exact: true }).fill('2026-12-12');
    assert.equal((await filteredStats).status(), 200);
    await page.getByRole('heading', { name: 'Sessions du périmètre' }).waitFor();
    const scope = page.locator('.report-session-list');
    assert.equal(await scope.locator('tbody tr').count(), 1);
    assert.ok((await scope.innerText()).includes(session.id));
    const filteredResponses = await page.request.get(
      `${url}/api/responses?dateFrom=2026-12-12&dateTo=2026-12-12`,
    );
    assert.equal(filteredResponses.status(), 200);
    assert.deepEqual(
      (await filteredResponses.json()).items.map((item: { sessionId: string }) => item.sessionId),
      [session.id],
    );
    const filteredExcel = await page.request.get(
      `${url}/api/exports?format=xlsx&dateFrom=2026-12-12&dateTo=2026-12-12`,
    );
    assert.equal(filteredExcel.status(), 200);
    const reportWorkbook = XLSX.read(await filteredExcel.body(), { type: 'buffer' });
    const exportedSessions = XLSX.utils.sheet_to_json<{ 'ID session': string }>(
      reportWorkbook.Sheets.Sessions,
    );
    assert.deepEqual(
      exportedSessions.map((item) => item['ID session']),
      [session.id],
    );
    const exportedAnswers = XLSX.utils.sheet_to_json<{ Session: string }>(
      reportWorkbook.Sheets['Réponses détaillées'],
    );
    assert.ok(
      exportedAnswers.length > 0 && exportedAnswers.every((item) => item.Session === session.id),
    );
    const filteredPdf = await page.request.get(
      `${url}/api/exports?format=pdf&dateFrom=2026-12-12&dateTo=2026-12-12`,
    );
    assert.equal(filteredPdf.status(), 200);
    assert.ok((await PDFDocument.load(await filteredPdf.body())).getPageCount() > 0);
    assert.equal(
      (await page.request.get(`${url}/api/statistics?dateFrom=2026-02-30`)).status(),
      400,
    );
    assert.equal(
      (await page.request.get(`${url}/api/exports?dateFrom=2026-12-13&dateTo=2026-12-12`)).status(),
      400,
    );
    await page.screenshot({
      path: 'test-results/rapports-filtres-desktop.png',
      animations: 'disabled',
    });
    await page.getByLabel('Période de formation', { exact: true }).selectOption('range');
    await page.getByLabel('Du', { exact: true }).fill('2026-12-11');
    await page.getByLabel('Au', { exact: true }).fill('2026-12-14');
    await page.getByRole('heading', { name: 'Sessions du périmètre' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/rapports-filtres-mobile.png',
      animations: 'disabled',
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
    assert.equal(
      await page.getByLabel('Période de formation', { exact: true }).inputValue(),
      'all',
    );
    // Start a fresh window for the independent archive/reactivation/deletion phase.
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'admin:' } } });
    await page.goto(`${url}/admin?view=sessions&session=${session.id}`);
    await page.getByRole('heading', { name: 'Vue d’ensemble', exact: true }).waitFor();
    for (const format of ['xlsx', 'pdf']) {
      const report = await page.request.get(
        `${url}/api/exports?sessionId=E2E-2026-001&format=${format}`,
      );
      assert.equal(report.status(), 200);
    }
    const spec = await (await page.request.get(`${url}/api/openapi`)).json();
    assert.equal(spec.openapi, '3.0.3');
    assert.ok(spec.paths['/api/participants']);
    assert.ok(spec.components.schemas.Answer);
    assert.equal(
      (await page.request.get(`${url}/admin/sessions/${session.id}/preview`)).status(),
      200,
    );
    const sessionBody = {
      ...session,
      date: session.date.slice(0, 10),
      endDate: session.endDate.slice(0, 10),
    };
    // Isolate archive/reactivation checks from the preceding report/export traffic.
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'admin:' } } });
    assert.equal(
      (
        await page.request.delete(`${url}/api/sessions/${session.id}`, {
          headers: { Origin: url },
          data: { confirmation: 'supprimer la session' },
        })
      ).status(),
      409,
    );
    const modified = await page.request.patch(`${url}/api/sessions/${session.id}`, {
      headers: { Origin: url },
      data: { ...sessionBody, trainer: 'Marie Martin' },
    });
    assert.equal(modified.status(), 200);
    assert.equal((await modified.json()).pdfTemplateId, savedTemplate.id);
    const waitingParticipant = await db.participant.findFirstOrThrow({
      where: { sessionId: session.id, submittedAt: null },
    });
    const queuedEmail = await db.emailDelivery.create({
      data: {
        sessionId: session.id,
        participantId: waitingParticipant.id,
        automaticKey: waitingParticipant.id,
      },
    });
    const archived = await page.request.patch(`${url}/api/sessions/${session.id}`, {
      headers: { Origin: url },
      data: { ...sessionBody, endDate: undefined, emailSchedule: null, status: 'ARCHIVED' },
    });
    assert.equal(archived.status(), 200);
    const firstArchiveDate = (await archived.json()).archivedAt;
    assert.ok(firstArchiveDate);
    assert.equal(
      (await db.trainingSession.findUniqueOrThrow({ where: { id: session.id } })).endDate
        ?.toISOString()
        .slice(0, 10),
      '2026-12-14',
    );
    assert.equal(
      (await db.emailDelivery.findUniqueOrThrow({ where: { id: queuedEmail.id } })).status,
      'PAUSED',
    );
    const archiveEdit = await page.request.patch(`${url}/api/sessions/${session.id}`, {
      headers: { Origin: url },
      data: { ...sessionBody, status: 'ARCHIVED', trainer: 'Autre formateur' },
    });
    assert.equal((await archiveEdit.json()).archivedAt, firstArchiveDate);
    await page.goto(`${url}/admin?view=sessions&session=${session.id}`);
    await page.getByRole('button', { name: 'Réactiver la session', exact: true }).click();
    const resumeDialog = page.getByRole('dialog');
    assert.equal(
      await resumeDialog
        .getByRole('radio', { name: 'Conserver les e-mails suspendus', exact: true })
        .isChecked(),
      true,
    );
    await resumeDialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.equal(
      (await db.trainingSession.findUniqueOrThrow({ where: { id: session.id } })).status,
      'ARCHIVED',
    );
    await page.getByRole('button', { name: 'Réactiver la session', exact: true }).click();
    await resumeDialog.screenshot({ path: 'test-results/session-reactivation-email-choice.png' });
    const retained = page.waitForResponse(
      (r) => r.url().endsWith(`/api/sessions/${session.id}`) && r.request().method() === 'PATCH',
    );
    await resumeDialog.getByRole('button', { name: 'Confirmer mon choix', exact: true }).click();
    assert.equal((await retained).status(), 200);
    await resumeDialog.waitFor({ state: 'hidden' });
    assert.equal(
      (await db.sessionEmailSchedule.findUniqueOrThrow({ where: { sessionId: session.id } }))
        .suspended,
      true,
    );
    const archiveAgain = page.waitForResponse(
      (r) => r.url().endsWith(`/api/sessions/${session.id}`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Archiver la session', exact: true }).click();
    assert.equal((await archiveAgain).status(), 200);
    // Changing the status through the editor must offer the same choice.
    await page.getByRole('button', { name: 'Réactiver la session', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await resumeDialog.locator('select[name="status"]').selectOption('ACTIVE');
    await resumeDialog
      .getByRole('radio', { name: 'Reprogrammer les e-mails non envoyés', exact: true })
      .check();
    const resumeDate = emailDueDate(new Date(luxembourgDate(new Date())), 7);
    await resumeDialog.getByLabel('Date de reprise', { exact: true }).fill(resumeDate);
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('dialog button')].find((b) =>
        b.textContent?.includes('Enregistrer les modifications'),
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    const resumed = page.waitForResponse(
      (r) => r.url().endsWith(`/api/sessions/${session.id}`) && r.request().method() === 'PATCH',
    );
    await resumeDialog
      .getByRole('button', { name: 'Enregistrer les modifications', exact: true })
      .click();
    assert.equal((await resumed).status(), 200);
    await resumeDialog.waitFor({ state: 'hidden' });
    const schedule = await db.sessionEmailSchedule.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    assert.equal(schedule.suspended, false);
    assert.equal(schedule.resumeOn?.toISOString().slice(0, 10), resumeDate);
    assert.equal(
      (await db.emailDelivery.findUniqueOrThrow({ where: { id: queuedEmail.id } })).notBefore
        ?.toISOString()
        .slice(0, 10),
      resumeDate,
    );
    const finalArchive = page.waitForResponse(
      (r) => r.url().endsWith(`/api/sessions/${session.id}`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Archiver la session', exact: true }).click();
    assert.equal((await finalArchive).status(), 200);
    assert.equal(
      (
        await page.request.delete(`${url}/api/sessions/${session.id}`, {
          headers: { Origin: url },
          data: { confirmation: 'incorrect' },
        })
      ).status(),
      400,
    );
    // The destructive confirmation is a separate scenario from repeated archive/edit requests.
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'admin:' } } });
    await page.goto(`${url}/admin?view=sessions&session=${session.id}`);
    await page.getByRole('region', { name: 'Zone de suppression définitive' }).waitFor();
    await page.getByRole('button', { name: 'Supprimer la session', exact: true }).click();
    const deleteDialog = page.getByRole('dialog');
    const deleteButton = deleteDialog.getByRole('button', {
      name: 'Supprimer définitivement',
      exact: true,
    });
    assert.equal(await deleteButton.isDisabled(), true);
    await deleteDialog.getByRole('textbox').fill('incorrect');
    assert.equal(await deleteButton.isDisabled(), true);
    await deleteDialog.getByRole('textbox').fill('supprimer la session');
    await deleteDialog.screenshot({ path: 'test-results/session-delete-confirmation.png' });
    const deletedSession = page.waitForResponse(
      (r) => r.url().endsWith(`/api/sessions/${session.id}`) && r.request().method() === 'DELETE',
    );
    await deleteButton.click();
    assert.equal((await deletedSession).status(), 204);
    await deleteDialog.waitFor({ state: 'hidden' });
    assert.equal(await db.participant.count(), 0);
    assert.equal(await db.response.count(), 0);
    assert.equal(await db.webhookDelivery.count(), 0);
    assert.equal(await db.odooConnection.count(), 0);
    assert.equal(await db.emailDelivery.count(), 0);
    // Start a fresh admin rate window for the next independent test phase.
    // This browser robot performs more actions per minute than an administrator.
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'admin:' } } });
    // Leave the session removed through the API before testing the template library again.
    await page.goto(`${url}/admin?view=templates`);
    await page.getByRole('heading', { name: 'Modèles PDF.' }).waitFor();
    await page
      .getByRole('button', { name: 'Dupliquer Invitation test modifiée', exact: true })
      .click();
    await page.getByLabel('Nom du modèle', { exact: true }).fill('Copie test PDF');
    await page.getByRole('button', { name: 'Enregistrer le modèle', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await db.pdfTemplate.count(), 2);
    await page.getByRole('button', { name: 'Supprimer Copie test PDF', exact: true }).click();
    await page.getByRole('button', { name: 'Supprimer le modèle', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await db.pdfTemplate.count(), 1);
    assert.equal(
      (
        await page.request.delete(`${url}/api/pdf-templates/${savedTemplate.id}`, {
          headers: { Origin: url },
        })
      ).status(),
      204,
    );
    assert.equal(
      (
        await page.request.delete(`${url}/api/pdf-templates/hot-classic`, {
          headers: { Origin: url },
        })
      ).status(),
      403,
    );
    assert.equal(await db.pdfTemplate.count(), 0);
    await page.goto(`${url}/docs`);
    await page.getByRole('heading', { name: 'Une écoute bien organisée.' }).waitFor();
    // A classroom shares its IP: distinct links must not hit the old 30/5-minute budget.
    for (let i = 0; i < 40; i++) {
      const response = await page.request.post(`${url}/api/submit`, {
        headers: { Origin: url },
        data: {
          sessionId: 'MISSING-SESSION',
          token: randomBytes(32).toString('base64url'),
          answers: [],
        },
      });
      assert.equal(response.status(), 404);
    }
    const repeatedToken = randomBytes(32).toString('base64url');
    for (let i = 0; i < 11; i++) {
      const response = await page.request.post(`${url}/api/submit`, {
        headers: { Origin: url },
        data: { sessionId: 'MISSING-SESSION', token: repeatedToken, answers: [] },
      });
      assert.equal(response.status(), i === 10 ? 429 : 404);
    }
    await db.admin.update({
      where: { email: 'admin@example.com' },
      data: { passwordHash: await hash(randomBytes(18).toString('hex'), 12) },
    });
    assert.equal(
      (await page.request.get(`${url}/api/sessions`)).status(),
      401,
      'Une session antérieure au changement de mot de passe doit être révoquée.',
    );
    assert.deepEqual(pageErrors, []);
    console.log(
      'Navigateur : aperçu desktop/mobile, connexion, création/modification/archivage/suppression, import, verrouillage des questions, CSRF, exports Excel/PDF, accès anonyme, formulaire mobile et usage unique : OK.',
    );
  } catch (error) {
    const failurePage = browser?.contexts()[0]?.pages()[0];
    if (failurePage)
      await failurePage
        .screenshot({
          path: 'test-results/browser-failure.png',
          fullPage: true,
          animations: 'disabled',
        })
        .catch(() => {});
    throw error;
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
      await new Promise((r) => setTimeout(r, 700));
    }
    if (db) await db.$disconnect();
    if (started) await pg.stop();
  }
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
