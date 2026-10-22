import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { invitationEmail } from '../src/lib/email-template';
async function main() {
  const logo = await readFile(resolve('public/house-of-training-pdf.png'));
  const message = invitationEmail({
    firstName: 'Camille',
    sessionName: 'DORA Foundation',
    date: new Date('2026-12-11'),
    trainer: 'Jean Dupont',
    sessionId: 'DORA-2026-001',
    url: 'https://questionnaires.example.org/form/DORA-2026-001/EXEMPLE-LIEN-PERSONNEL',
    logoUrl: `data:image/png;base64,${logo.toString('base64')}`,
  });
  await mkdir(resolve('test-results'), { recursive: true });
  await writeFile(resolve('test-results/apercu-email-invitation.html'), message.html, 'utf8');
  await writeFile(
    resolve('test-results/apercu-email-invitation.txt'),
    `${message.subject}\n\n${message.text}`,
    'utf8',
  );
  console.log(
    'Aperçu HTML et version texte créés dans test-results/apercu-email-invitation.*. Aucune donnée réelle et aucun e-mail envoyé.',
  );
}
main().catch(() => {
  console.error('Impossible de générer l’aperçu du modèle.');
  process.exitCode = 1;
});
