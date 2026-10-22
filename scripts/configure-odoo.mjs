import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
let content = await readFile('.env.local', 'utf8');
const existingValues = process.env;
if (!existingValues.ODOO_UAT_SESSION_NAME || !existingValues.ODOO_UAT_TRAINER)
  throw new Error(
    'Renseignez ODOO_UAT_SESSION_NAME et ODOO_UAT_TRAINER dans .env.local avant de configurer le lien de test.',
  );
const url = process.argv[process.argv.indexOf('--url') + 1];
const parsed = new URL(url);
if (
  !process.argv.includes('--url') ||
  parsed.origin !== 'https://odoo.uat.houseoftraining.lu' ||
  !/^\/session\/satisfaction\/[a-f\d-]{36}$/.test(parsed.pathname) ||
  parsed.search ||
  parsed.hash ||
  parsed.username ||
  parsed.password
)
  throw new Error('Un lien de satisfaction Odoo UAT valide est requis.');
const values = {
  ODOO_UAT_ENABLED: 'true',
  ODOO_UAT_SOURCE_SESSION_ID: '203238',
  ODOO_UAT_SESSION_ID: '203238',
  ODOO_UAT_SATISFACTION_URL: parsed.toString(),
  ODOO_UAT_SESSION_NAME: existingValues.ODOO_UAT_SESSION_NAME,
  ODOO_UAT_TRAINER: existingValues.ODOO_UAT_TRAINER,
};
for (const [key, value] of Object.entries(values)) {
  const existing = content
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.trim()
    .replace(/^"|"$/g, '');
  if (existing && existing !== value)
    throw new Error(`Configuration ${key} existante différente : conservée.`);
  const line = `${key}=${JSON.stringify(value)}`;
  content = new RegExp(`^${key}=.*$`, 'm').test(content)
    ? content.replace(new RegExp(`^${key}=.*$`, 'm'), () => line)
    : `${content.trimEnd()}\n${line}\n`;
}
await writeFile('.env.local', content, { mode: 0o600 });
console.log(
  'Odoo UAT configuré uniquement pour la session 203238 dans .env.local. Aucun envoi effectué.',
);
