import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;

if (process.argv.includes('--init-secret')) {
  const path = '.env.local';
  let content = await readFile(path, 'utf8');
  const key = 'POWER_AUTOMATE_WEBHOOK_SECRET';
  const existing = content
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  if (existing) console.log('Le secret dédié existe déjà. Il est conservé dans .env.local.');
  else {
    const line = `${key}="${randomBytes(32).toString('hex')}"`;
    content = new RegExp(`^${key}=.*$`, 'm').test(content)
      ? content.replace(new RegExp(`^${key}=.*$`, 'm'), line)
      : `${content.trimEnd()}\n${line}\n`;
    await writeFile(path, content, { mode: 0o600 });
    console.log(
      'Secret dédié créé dans .env.local ; copiez sa valeur dans la condition du flux Power Automate.',
    );
  }
}
loadEnvConfig(process.cwd());
const raw = process.env.POWER_AUTOMATE_WEBHOOK_URL;
let valid = false;
try {
  valid = !!raw && new URL(raw).protocol === 'https:';
} catch {}
console.log(
  `URL du flux HTTPS : ${valid ? 'renseignée' : 'à renseigner dans POWER_AUTOMATE_WEBHOOK_URL'}.`,
);
console.log(
  `Secret de contrôle : ${process.env.POWER_AUTOMATE_WEBHOOK_SECRET ? 'renseigné' : 'à créer avec --init-secret'}.`,
);
