import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

async function main() {
  const url = process.argv[2];
  if (!url || !url.startsWith('https://odoo.uat.houseoftraining.lu/session/satisfaction/'))
    throw new Error('Lien de questionnaire Odoo UAT requis.');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const details = await page.evaluate(() => ({
      title: document.title,
      text: document.querySelector('form[action="/session/satisfaction"]')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 14000),
      headings: [...document.querySelectorAll('h1,h2,h3')].map((e) => e.textContent?.trim()).filter(Boolean),
      forms: [...document.forms].map((form) => ({
        action: form.getAttribute('action'), method: form.method,
        fields: [...form.querySelectorAll('input,select,textarea')].map((element) => {
          const field = element as HTMLInputElement;
          return { name: field.name, type: field.type, value: /csrf|token/i.test(field.name) ? '[redacted]' : field.type === 'hidden' || field.type === 'radio' ? field.value : undefined,
            label: field.labels?.[0]?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 300),
            context: field.name.match(/^\d+$/) ? field.parentElement?.outerHTML.slice(0, 1800) : undefined };
        }),
      })),
    }));
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/odoo-inspection.json', JSON.stringify({ status: response?.status(), ...details }, null, 2));
    console.log(JSON.stringify({ status: response?.status(), ...details }, null, 2));
    await page.screenshot({ path: 'test-results/odoo-before-submit.png', fullPage: true });
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.name : 'OdooInspectionError'); process.exitCode = 1; });
