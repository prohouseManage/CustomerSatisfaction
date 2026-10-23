import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Download, ShieldCheck } from 'lucide-react';
import Brand from '@/components/brand';
import { openapi } from '@/lib/openapi';
import { demoAllowed } from '@/lib/demo';
export default function Docs() {
  return (
    <main className="docs-layout">
      <header className="docs-header">
        <Brand />
        <Link className="btn secondary" href="/">
          <ArrowLeft size={15} />
          Retour à l’application
        </Link>
      </header>
      <span className="eyebrow pink">GUIDE & DOCUMENTATION</span>
      <h1 style={{ marginTop: 14 }}>Une écoute bien organisée.</h1>
      <p>
        De la création d’une session à l’analyse des retours : retrouvez les étapes et la référence
        de l’API de satisfaction House of Training.
      </p>
      <div className="docs-actions">
        <a className="btn primary" href="/api/openapi" target="_blank" rel="noreferrer">
          <ArrowUpRight size={16} />
          Spécification OpenAPI 3.0
        </a>
        {demoAllowed() && (
          <Link className="btn secondary" href="/demo/form">
            <ShieldCheck size={16} />
            Exemple de questionnaire
          </Link>
        )}
      </div>
      <section className="docs-section">
        <h2>Votre première enquête</h2>
        <ol>
          <li>
            <strong>Créez une session.</strong> Renseignez le nom, les dates de début et de fin et
            le formateur, puis adaptez les questions. Pour une formation d’une journée, utilisez la
            même date.
          </li>
          <li>
            <strong>Importez les participants.</strong> Utilisez un fichier .xlsx avec les colonnes
            Nom, Prénom, Email. Maximum 1 000 participants par import et 2 Mo. Le questionnaire est
            ensuite verrouillé.
          </li>
          <li>
            <strong>Activez la session.</strong> Les liens des sessions en brouillon ou archivées
            sont fermés. Une date limite facultative ferme aussi les réponses à la fin du jour
            choisi, heure de Luxembourg, sans archiver la session.
          </li>
          <li>
            <strong>Partagez les accès.</strong> Exportez les liens Excel ou les QR Codes PDF depuis
            la session, ou envoyez une invitation par e-mail. L’envoi automatique, lorsqu’il est
            activé dans les paramètres, part après la date de fin de formation selon le délai
            choisi.
          </li>
          <li>
            <strong>Analysez les retours.</strong> Le tableau de bord et les rapports se mettent à
            jour après les soumissions. Exportez les résultats en Excel ou PDF.
          </li>
        </ol>
        <p>
          Pour supprimer une session, archivez-la puis saisissez « supprimer la session » dans la
          zone rouge. Les données associées sont supprimées définitivement. Dans les paramètres,
          vous pouvez aussi activer la suppression automatique après un délai en jours, mois ou
          années.
        </p>
      </section>
      <section className="docs-section">
        <h2>Déploiement Supabase & Vercel</h2>
        <p>
          Le menu Automatisations présente les derniers passages de la tâche planifiée et les envois
          à vérifier. Les participants peuvent choisir le français, l’allemand ou l’anglais dans
          leur questionnaire. Les traductions des questions personnalisées se complètent dans
          l’éditeur de session.
        </p>
        <p>
          La clé publique Supabase identifie le projet. Prisma utilise les connexions PostgreSQL de
          Supabase → Connect. Renseignez <code>DATABASE_URL</code> avec le pooler transactionnel et{' '}
          <code>DIRECT_URL</code> avec le pooler de session ou la connexion directe.
        </p>
        <pre>{`npm ci\nnpm run db:migrate\nnpm run db:admin\nnpm run dev`}</pre>
        <p>
          Les variables du compte administrateur sont <code>ADMIN_EMAIL</code>,{' '}
          <code>ADMIN_NAME</code> et <code>ADMIN_PASSWORD</code> (12 caractères minimum). Le fichier
          README contient la procédure complète et les variables de sécurité. Sur Vercel, configurez{' '}
          <code>NEXTAUTH_URL</code> avec votre URL HTTPS.
        </p>
        <p>
          Les tables de l’application sont réservées au serveur : RLS est activée sans politique
          publique. Aucune clé <code>service_role</code> n’est exposée au navigateur.
        </p>
      </section>
      <section className="docs-section">
        <h2>Power Automate → SharePoint</h2>
        <ol>
          <li>Créez un flux avec le déclencheur « Lors de la réception d’une requête HTTP ».</li>
          <li>
            Configurez l’URL de ce déclencheur dans <code>POWER_AUTOMATE_WEBHOOK_URL</code>.
          </li>
          <li>Utilisez le payload ci-dessous comme exemple pour générer le schéma du flux.</li>
          <li>
            Créez un élément SharePoint avec <code>eventId</code> dans une colonne unique ; cela
            empêche les doublons lors des reprises.
          </li>
          <li>Ajoutez les actions Outlook, Power BI ou Odoo dont vous avez besoin dans ce flux.</li>
        </ol>
        <pre>
          {JSON.stringify(
            {
              eventId: '68490212-927a-4f36-977a-c9db2df4c211',
              sessionId: 'DORA-2026-001',
              participantId: '9328afca-d3ce-4ca0-80fc-38b12338cc43',
              nom: 'Dupont',
              prenom: 'Jean',
              email: 'jean@example.com',
              submittedAt: '2026-12-11T10:00:00Z',
              answers: [
                {
                  questionId: '938dcd92-1456-42d5-9e3f-50296f4bb49d',
                  label: 'La formation correspondait globalement à mes attentes',
                  type: 'RATING_4',
                  value: 4,
                  comment: 'Le contenu correspondait à mes attentes.',
                },
              ],
            },
            null,
            2,
          )}
        </pre>
        <p>
          Les réponses et l’événement sortant sont enregistrés dans la même transaction. La
          livraison est tentée après la soumission, puis reprise par le cron et le bouton des
          intégrations. Une livraison peut se répéter : dédupliquez toujours avec{' '}
          <code>eventId</code>. Le cron Vercel fourni s’exécute une fois par jour et traite 20
          événements par passage ; augmentez sa fréquence pour votre volume et votre offre Vercel.
        </p>
        <p>
          <code>POST /api/webhook/powerautomate</code> est le récepteur des événements envoyés{' '}
          <em>par</em> Power Automate. Il exige <code>x-webhook-secret</code>, comparé à{' '}
          <code>POWER_AUTOMATE_INBOUND_SECRET</code>. Il ne remplace pas l’URL de votre flux
          sortant.
        </p>
      </section>
      <section className="docs-section">
        <h2>Référence REST</h2>
        <p>
          Les routes administrateur nécessitent le cookie de session NextAuth. Toute mutation depuis
          le navigateur exige un en-tête <code>Origin</code> égal à l’origine configurée dans{' '}
          <code>NEXTAUTH_URL</code>. Le formulaire participant utilise son token personnel. Les
          webhooks et le cron utilisent des secrets dédiés.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MÉTHODE</th>
                <th>ENDPOINT</th>
                <th>FONCTION</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(openapi.paths).flatMap(([path, methods]) =>
                Object.entries(methods).map(([method, details]) => (
                  <tr key={`${method}${path}`}>
                    <td>
                      <span className="status draft">{method.toUpperCase()}</span>
                    </td>
                    <td>
                      <code>{path}</code>
                    </td>
                    <td>{details.summary}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="notice">
        <ShieldCheck size={18} />
        Les liens participants contiennent un secret d’accès. Transmettez-les uniquement à leur
        destinataire et protégez les exports nominatifs.
      </div>
      <section className="docs-section" id="livraison-email">
        <h2>Suivre la livraison des invitations</h2>
        <p>
          Le suivi distingue la prise en charge par Mailgun, la livraison au serveur destinataire,
          la livraison différée et le rejet. « Livré » ne confirme pas la lecture ni le placement
          dans la boîte de réception. Consultez l’historique depuis le suivi e-mail d’un
          participant.
        </p>
        <p>
          L’administrateur technique doit configurer les événements Delivered, Temporary failure et
          Permanent failure du domaine Mailgun Europe vers <code>/api/webhook/mailgun</code>, puis
          renseigner la clé de signature HTTP Mailgun dans la variable serveur
          <code> MAILGUN_WEBHOOK_SIGNING_KEY</code> et redéployer. Aucun secret ne doit être saisi
          dans un formulaire participant. Les événements Accepted sont facultatifs.
        </p>
        <p>
          Les anciens envois restent sans confirmation de livraison tant qu’aucun événement ne les
          confirme. Actualisez le suivi pour consulter les derniers états.
        </p>
      </section>
    </main>
  );
}
