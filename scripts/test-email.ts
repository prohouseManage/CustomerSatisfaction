import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { baseUrl } from '../src/lib/crypto';
import { smtpConfiguration, sendSmtpEmail, EmailSendError } from '../src/lib/email-smtp';

loadEnvConfig(process.cwd());

async function main() {
  const recipient = z.string().email().safeParse(process.env.ADMIN_EMAIL);
  if (!recipient.success)
    throw new Error('Renseignez une adresse ADMIN_EMAIL valide pour ce test.');
  if (!smtpConfiguration()) throw new Error('La configuration SMTP Mailgun est incomplète.');
  if (!process.argv.includes('--send-test')) {
    console.log(
      'Configuration valide. Ajoutez --send-test pour envoyer un seul e-mail de test à ADMIN_EMAIL.',
    );
    return;
  }
  const url = baseUrl();
  const safeUrl = url.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
  await sendSmtpEmail({
    deliveryId: randomUUID(),
    to: recipient.data,
    subject: '[TEST] House of Training — réception des e-mails',
    text: `Bonjour,\n\nCeci est un test de réception des e-mails de notre application de satisfaction House of Training, envoyé via Mailgun.\n\nOuvrir l’application : ${url}\n\nSi l’adresse est locale (localhost), le lien s’ouvre uniquement sur le poste où l’application est démarrée.\n\nAucune session ni réponse participant n’a été créée ou modifiée.\n\nHouse of Training`,
    html: `<div style="font-family:Arial,sans-serif;color:#252038;max-width:620px;margin:auto"><h2>House of Training</h2><p><strong>Test de réception des e-mails</strong></p><p>Bonjour,</p><p>Ce message confirme un test d’envoi de notre application de satisfaction via Mailgun.</p><p style="margin:30px 0"><a href="${safeUrl}" style="background:#d20b72;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;display:inline-block">Ouvrir l’application de test</a></p><p>Si l’adresse est locale (localhost), ce bouton fonctionne uniquement sur le poste où l’application est démarrée.</p><p>Aucune session ni réponse participant n’a été créée ou modifiée.</p><p>House of Training</p></div>`,
  });
  console.log(
    `Un e-mail de test a été accepté par Mailgun pour ${recipient.data}. Vérifiez la boîte de réception et les courriers indésirables.`,
  );
}
main().catch((error: unknown) => {
  if (error instanceof EmailSendError)
    console.error(
      error.uncertain
        ? 'Envoi non confirmé. Vérifiez Mailgun et la boîte de réception avant de retenter.'
        : 'Échec SMTP avant envoi. Vérifiez la configuration Mailgun.',
    );
  else
    console.error(
      error instanceof Error && /^(Renseignez|La configuration)/.test(error.message)
        ? error.message
        : 'Test interrompu. Aucun nouvel essai automatique.',
    );
  process.exitCode = 1;
});
