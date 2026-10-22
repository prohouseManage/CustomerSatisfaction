import { loadEnvConfig } from '@next/env';
import { readFile } from 'node:fs/promises';
loadEnvConfig(process.cwd());
async function main() {
  if (!process.argv.includes('--send-test'))
    throw new Error(
      'Ajoutez --send-test pour créer les éléments fictifs TEST-HOT-2026 dans SharePoint. Aucun questionnaire réel ne sera soumis.',
    );
  const raw = process.env.POWER_AUTOMATE_WEBHOOK_URL;
  if (!raw) throw new Error('Renseignez POWER_AUTOMATE_WEBHOOK_URL dans .env.local.');
  try {
    if (new URL(raw).protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('Une URL de flux HTTPS valide est requise.');
  }
  const payload = JSON.parse(await readFile('docs/powerautomate/exemple-reponse.json', 'utf8'));
  const response = await fetch(raw, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': payload.eventId,
      ...(process.env.POWER_AUTOMATE_WEBHOOK_SECRET
        ? { 'x-webhook-secret': process.env.POWER_AUTOMATE_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(
      `Le flux a retourné HTTP ${response.status}. Consultez son historique d’exécution.`,
    );
  const ack = await response.json().catch(() => null);
  if (response.status !== 200 || ack?.received !== true || ack.eventId !== payload.eventId)
    throw new Error(
      'Accusé de réception incorrect. Placez l’action Réponse HTTP 200 à la fin du flux avec received=true et eventId.',
    );
  console.log(
    'Le flux confirme l’enregistrement du test. Vérifiez TEST-HOT-2026 dans les listes SharePoint.',
  );
  console.log(
    'Relancer cette commande réutilise le même EventId pour vérifier l’absence de doublon.',
  );
}
main().catch((error) => {
  const safe =
    error instanceof Error &&
    /^(Ajoutez|Renseignez|Une URL|Le flux a retourné|Accusé de réception)/.test(error.message);
  console.error(
    safe
      ? (error as Error).message
      : 'Connexion au flux impossible ou délai dépassé. Consultez l’historique Power Automate.',
  );
  process.exitCode = 1;
});
