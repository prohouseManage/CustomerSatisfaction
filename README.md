# Écoute · House of Training

Application de gestion d’enquêtes de satisfaction : Next.js 16, React, TypeScript, Tailwind CSS 4, NextAuth, Prisma 6 et PostgreSQL (Supabase). Import SheetJS `xlsx` 0.20.3, QR Codes `qrcode`, PDF `jspdf`.

## Configuration

Les connexions et identifiants se configurent dans `.env.local`, ignoré par Git, puis dans les variables d’environnement serveur du déploiement. Utiliser un mot de passe administrateur différent de celui de PostgreSQL. Aucun secret ni donnée réelle de participant n’est fourni dans le dépôt.

L’application utilise PostgreSQL Supabase et NextAuth pour l’authentification administrateur. **Le flux Power Automate doit être configuré pour transmettre les réponses à SharePoint.** Aucun compte administrateur par défaut ni connexion SharePoint implicite. L’envoi automatique d’invitations reste désactivé tant qu’il n’est pas activé dans les paramètres.

L’envoi direct à **Odoo se configure dans chaque session** : coller le lien du questionnaire dans **Envoi vers Odoo**, vérifier le lien si souhaité et activer l’envoi automatique. Les tokens sont récupérés automatiquement au moment du POST. Production et préproduction sont prises en charge. L’essai historique 203238 reste compatible ; aucun nouvel envoi réel n’a été effectué pour cette évolution. Procédure : [Intégration Odoo par session](docs/odoo.md).

La clé publique Supabase ne permet pas de configurer Prisma : celui-ci utilise les connexions PostgreSQL côté serveur. Les variables `NEXT_PUBLIC_SUPABASE_*` sont facultatives pour cette architecture, qui ne dépend pas du client Supabase REST.

## Démarrage local

Le menu **Automatisations** présente le suivi des tâches planifiées. Le questionnaire participant propose le français, l’allemand et l’anglais ; les traductions des questions personnalisées se règlent dans l’éditeur de session. Détails : [Suivi et langues](docs/automatisations-langues.md).

Node.js 22 est recommandé (minimum de l’application avec le parseur HTML Odoo : 20.18.1).

```powershell
npm ci
```

Copiez `.env.example` vers `.env.local` puis générez **indépendamment** `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` et `CRON_SECRET` :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ne versionnez jamais `.env.local`. Gardez `TOKEN_ENCRYPTION_KEY` : son remplacement rend les liens déjà chiffrés impossibles à réexporter. Une rotation nécessite une migration des données.

### Connecter Supabase

Dans **Supabase → Connect**, copiez les connexions PostgreSQL, en remplaçant le mot de passe par votre mot de passe de base (encodé dans l’URL si nécessaire).

```dotenv
# Application : pooler en mode transactionnel, port 6543
DATABASE_URL="postgresql://postgres.YOUR_PROJECT:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true&connection_limit=5&sslmode=require"
# Migrations : pooler en mode session (IPv4) ou connexion directe (souvent IPv6), port 5432
DIRECT_URL="postgresql://postgres.YOUR_PROJECT:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
```

Utilisez les hôtes exacts affichés dans votre projet Supabase, sans déduire sa région depuis son URL publique. Utilisez le propriétaire PostgreSQL ou un rôle serveur avec les droits appropriés et contournement RLS ; jamais le rôle `anon` ou `authenticated` pour Prisma.

```powershell
npm run db:migrate
```

Cette commande charge `.env.local` avant d’exécuter Prisma. Les migrations créent les tables et activent **RLS sans politique publique** sur les seize tables, dont les modèles PDF, les connexions Odoo, les paramètres de conservation et le suivi des e-mails et automatisations. Les droits des rôles Supabase `anon` et `authenticated` sont également révoqués. Les données sont accessibles uniquement au backend. N’utilisez pas `prisma db push` à la place des migrations, car cela omettrait le verrouillage RLS.

La migration suivante protège également la table technique `_prisma_migrations` : Supabase lui attribue sinon les droits publics par défaut. Pour contrôler les deux connexions et les protections, exécutez `npm run db:check`.

### Créer le compte administrateur

Ajoutez temporairement dans `.env.local` :

```dotenv
ADMIN_EMAIL="votre.adresse@houseoftraining.lu"
ADMIN_NAME="Votre nom"
ADMIN_PASSWORD="un-mot-de-passe-unique-d-au-moins-12-caracteres"
```

```powershell
npm run db:admin
# Facultatif : créer la session DORA en brouillon, sans participants fictifs
npm run db:seed
npm run dev
```

Ouvrez `http://localhost:3000/login`. Après création, retirez `ADMIN_PASSWORD` de l’environnement. Pour réinitialiser un mot de passe : `npm run db:admin -- --reset-password` avec les variables renseignées à nouveau.

Conservez d’abord le mot de passe de l’application dans votre gestionnaire de mots de passe avant de retirer `ADMIN_PASSWORD`. Avec le serveur local démarré, `npm run check:login` vérifie la page de connexion, les API protégées et la déconnexion sur la base configurée. Cette commande lit les identifiants depuis `.env.local`, ne les affiche pas, ne crée pas de données de formation et laisse le serveur existant en fonctionnement. Elle enregistre les accès normaux dans les journaux d’authentification.

Sans connexion PostgreSQL, `/` ouvre `/demo` en développement : aperçu **en lecture seule**, avec données explicitement fictives. `/demo/form` permet de tester le questionnaire sans enregistrer de réponse. Les données de démonstration ne sont jamais insérées dans la base. En production, ces routes renvoient 404 sauf si `ENABLE_DEMO=true`.

## Parcours métier

1. Créer une session et ses questions, avec un identifiant immuable comme `DORA-2026-001`.
2. Adapter les questions avant d’importer des participants. Plusieurs types sont disponibles, avec caractère obligatoire facultatif et évaluation sur 4 étoiles.
3. Importer un `.xlsx` : première feuille, colonnes **Nom | Prénom | Email**, 1 à 1 000 lignes par import, 2 Mo maximum. Accents et casse des en-têtes tolérés. Un doublon dans le fichier fait échouer l’import ; les e-mails déjà présents dans la session sont ignorés et comptés. Les e-mails sont normalisés en minuscules. Tout l’import est transactionnel.
4. Activer la session pour ouvrir les liens. Dès le premier import, les questions sont verrouillées pour préserver l’intégrité des réponses. Le nom, la date, le formateur et le statut restent modifiables.
5. Dans la fiche de la session, choisir le **Modèle PDF de cette session** : ce choix est enregistré automatiquement. Cliquer sur **Télécharger toutes les fiches PDF** pour obtenir **un fichier unique avec une page A4 par participant**, avec son QR code personnel cliquable. Imprimer puis remettre chaque fiche à son destinataire. Les liens Excel restent disponibles. L’import n’envoie aucun e-mail immédiatement ; les invitations peuvent être planifiées ou envoyées manuellement après configuration du service d’e-mail.

Les **Paramètres → Invitations et rappels par e-mail** définissent un calendrier global à J+1, désactivé initialement. Chaque session peut suivre ce calendrier, personnaliser son délai (par exemple J+7) ou désactiver son automatisation. Un envoi automatique unique concerne tous les non-répondants ; les envois manuels permettent de cibler tous les non-répondants ou une personne précise, après confirmation. Voir [la configuration et les limites des e-mails](docs/emails.md). Le SMTP de Supabase Auth ne permet pas, à lui seul, ces envois personnalisés. 6. Le participant voit ses informations en lecture seule et répond. La soumission réussie consomme définitivement son lien. Une seconde soumission renvoie 409 et une nouvelle visite affiche « Ce questionnaire a déjà été complété. » 7. Consulter les rapports par session ou globaux. La satisfaction globale est calculée sur 4 étoiles. Les anciennes notes sont normalisées proportionnellement sur 4 sans modifier les réponses initiales. Les statistiques ne mélangent pas les champs Nombre avec les notes de satisfaction. 8. Archiver une session pour fermer ses liens et suspendre les e-mails non envoyés, même s’il reste des destinataires à contacter. À la réactivation, choisir **Conserver les e-mails suspendus** ou **Reprogrammer les e-mails non envoyés**, avec une date de reprise. La même proposition apparaît si le statut est changé dans l’éditeur. La zone rouge permet une suppression définitive après saisie exacte de **supprimer la session**, vérifiée également par l’API. Les données associées et les copies d’intégration locales sont supprimées.

## Rapports par date ou période

Dans **Rapports & analyses**, choisir toutes les dates, une date précise ou une période, puis éventuellement une session. Le sélecteur et la liste affichent les références, noms et dates pour distinguer les formations homonymes. Une session sur plusieurs jours est incluse dès que sa période croise les dates demandées, bornes incluses ; les anciennes sessions sans date de fin sont traitées comme une journée.

Les statistiques, résultats par question, dernières réponses et exports Excel/PDF utilisent le même périmètre. Le filtre concerne les **dates de formation**, quelle que soit la date de soumission des réponses. Les API `/api/statistics`, `/api/responses` et `/api/exports` acceptent `sessionId`, `dateFrom` et `dateTo` au format `AAAA-MM-JJ` ; pour une journée, utiliser deux bornes identiques. Les dates invalides et les périodes inversées sont refusées par le serveur. L’Excel inclut un onglet **Sessions** avec les identifiants et dates.

La fiche de session rassemble sa référence, son formateur, ses dates et son questionnaire, ainsi que la description, le nombre de participants sans réponse et la progression de participation. Le bouton des invitations est compact et dispose d’un rendu à hauteur fixe pour Outlook classique.

## Conservation des sessions archivées

Dans **Paramètres → Conservation des sessions archivées**, choisir un délai en **jours, mois ou années** et activer la suppression automatique. La règle est désactivée par défaut, avec un délai prérempli de **2 mois**. Son enregistrement n’exécute aucune suppression immédiate.

Le délai commence à `archivedAt`, renseigné à l’archivage. Modifier une session déjà archivée ne prolonge pas le délai. Réactiver remet cette date à null ; un nouvel archivage redémarre le délai. Les mois et années sont calendaires, avec ajustement au dernier jour du mois si nécessaire. Les archives présentes avant la migration `202610220002_archived_retention` reçoivent comme point de départ la date d’installation de cette migration, car leur ancienne date d’archivage était inconnue. Une modification de la règle s’applique aussi aux archives existantes.

Sur Vercel, le cron existant `/api/cron/webhooks`, protégé par `CRON_SECRET`, effectue le nettoyage quotidien à **06:00 UTC**, avant les livraisons. Les sessions sont supprimées au premier passage après l’échéance, par lots de 50 maximum. Les sessions actives et brouillons sont exclues. Un envoi dont le verrou est encore actif reporte la suppression. Paramétrage et nettoyage sont sérialisés ; les suppressions sont journalisées sans copie des réponses.

La suppression retire la session, les questions, participants, réponses, commentaires, connexion Odoo et copies d’événements locales. Les modèles PDF partagés, les traces d’audit et les données déjà reçues par Odoo ou SharePoint restent conservés dans leurs périmètres respectifs.

En utilisation locale, Next.js ne lance pas de cron permanent. Un planificateur externe doit exécuter la commande suivante depuis le dossier du projet :

```powershell
# Aperçu sans suppression, même si la règle est activée
npm run sessions:cleanup
# Exécution du nettoyage selon la règle enregistrée ; sans effet si désactivée
npm run sessions:cleanup:apply
```

API : `GET /api/settings/retention`, `PUT /api/settings/retention` avec `{enabled,value,unit}`, unités `DAYS`, `MONTHS`, `YEARS`. La suppression manuelle utilise `DELETE /api/sessions/{id}` avec le corps JSON `{"confirmation":"supprimer la session"}`. Authentification administrateur et contrôle Origin obligatoires pour les mutations.

## Modèles et invitations PDF

Dans **Modèles PDF**, personnalisez un des deux modèles intégrés (classique ou bandeau), ou créez un nouveau modèle. Les modèles personnalisés peuvent être modifiés, dupliqués et supprimés ; les deux modèles intégrés restent disponibles. Ils sont enregistrés dans PostgreSQL et utilisables dans toutes les sessions.

L’éditeur propose le titre, une présentation de House of Training, le message au participant, le pied de page, la couleur principale, l’affichage de l’e-mail et un extrait de la description de la formation. Les variables `{{formation}}`, `{{date}}`, `{{formateur}}`, `{{sessionId}}`, `{{prenom}}`, `{{nom}}`, `{{email}}` sont remplacées à la génération. Les textes sont du texte simple, sans HTML. L’aperçu utilise une identité fictive et un QR code vers `/demo/form`, jamais un token réel.

Dans la fiche de chaque session, le bloc **Fiches à remettre aux participants** propose directement le sélecteur **Modèle PDF de cette session**, un aperçu et le bouton **Télécharger toutes les fiches PDF**. Le choix est conservé en base pour cette session, y compris après fermeture ou rechargement de la page. Chaque session peut utiliser un modèle différent. Par défaut, les sessions existantes utilisent le modèle classique. Un modèle personnalisé utilisé par une session ne peut pas être supprimé tant qu’un autre modèle n’a pas été choisi pour cette session.

Le téléchargement produit un fichier contenant exactement une page A4 par participant, trié par nom, prêt à imprimer pour une remise en main propre. Logo officiel, nom de la formation, date, formateur, destinataire et QR code personnel sont toujours présents. Le QR code est également cliquable dans le PDF. Aucun token n’est régénéré et aucune réponse n’est consommée par cet export. Les participants déjà répondus apparaissent avec la mention « lien inactif ». Aucun participant : export PDF refusé avec un message invitant à importer la liste.

Les textes s’adaptent à leur zone sans ajouter de page ni couper silencieusement le contenu personnalisé ; un texte trop long après remplacement des variables est refusé avec une erreur explicite. Seule la description facultative de formation est un extrait de 220 caractères maximum, signalé comme tel. Les polices Noto Sans et leur licence libre sont incluses dans `public/fonts/` ; le logo PNG est dérivé du SVG officiel via `node scripts/prepare-pdf-logo.mjs`. Les fichiers nécessaires au PDF sont inclus dans les fonctions Vercel par `outputFileTracingIncludes`.

## Sécurité et concurrence

Le questionnaire standard contient 11 évaluations obligatoires sur 4 étoiles, chacune avec un commentaire de 2 000 caractères maximum, et « Suggestions d’amélioration » facultatif. Les commentaires sont facultatifs sauf pour les notes de 1 ou 2 dans une session dont l’intégration Odoo est active, conformément au formulaire Odoo. Les commentaires sont inclus dans les réponses, rapports Excel/PDF et événements Power Automate. Les anciens types sur 5/10 restent lisibles pour les historiques.

Pour mettre à jour les sessions utilisant exactement l’ancien modèle standard : `node --import tsx scripts/upgrade-questionnaires.ts` affiche les sessions concernées ; ajoutez `--apply` pour appliquer. Les anciennes questions sont conservées comme historiques, les réponses et les liens restent intacts et les participants déjà répondus ne peuvent pas soumettre à nouveau. Les questionnaires personnalisés sont conservés.

- Tokens de 32 octets aléatoires (256 bits), encodés en base64url (43 caractères). Vérification par SHA-256 et copie chiffrée AES-256-GCM pour les exports administrateur.
- L’identité du participant provient exclusivement de la base ; aucun champ nom, prénom ou e-mail dans le formulaire de soumission.
- Une transaction PostgreSQL verrouille la session, valide les réponses, marque le participant, crée la réponse et l’événement sortant. La contrainte unique `Response.participantId` et la mise à jour conditionnelle `submittedAt IS NULL` renforcent la garantie d’usage unique, y compris pour des requêtes simultanées.
- Les mutations de session et imports prennent le même verrou ; un archivage ou une modification ne peut pas interférer avec la validation d’une soumission.
- NextAuth Credentials, mot de passe bcrypt (coût 12), session JWT de 8 h. Le compte est revérifié en base sur chaque accès administrateur. Pas d’inscription publique.
- Protection CSRF NextAuth pour l’authentification et validation stricte d’`Origin` sur les mutations métier, y compris `/api/submit`. HTTPS obligatoire pour `NEXTAUTH_URL` en production ; redirection des accès signalés HTTP par le proxy.
- Limites partagées en PostgreSQL : connexion 10 tentatives/e-mail et 30/IP sur 15 min ; soumission 30/IP sur 5 min ; ouverture de formulaire 90/IP sur 5 min ; API admin 120/min ; exports 10/5 min. Une limite de connexion reste active jusqu’à expiration même après un succès.
- Sur Vercel, empreinte d’IP dérivée de l’en-tête contrôlé par la plateforme ; sur un autre hébergeur, le proxy doit écraser `x-forwarded-for`.
- En-têtes de sécurité, politique Referrer `no-referrer`, caches API/formulaires désactivés, validation serveur Zod, limites de taille JSON/Excel et de taille déclarée de l’archive décompressée.
- Journal `AuditLog` sans token ni réponses ; IP hachée avec le secret serveur. Les pages participant valides, invalides et les connexions sont journalisées.
- Les réponses sont **nominatives**. La suppression automatique des sessions archivées s’active dans les paramètres. Les sauvegardes, exports déjà téléchargés et journaux ont leur propre politique de conservation.
- Les liens contiennent un secret dans l’URL. Configurez également la rétention et le masquage des chemins `/form/*` dans vos outils d’observabilité et journaux d’hébergement. N’ajoutez pas de traceur tiers sur ces pages.

## Power Automate / SharePoint

Site cible à renseigner dans le flux, par exemple `https://YOUR_TENANT.sharepoint.com/sites/Formation`.

Le [guide de configuration complet](docs/powerautomate/README.md) fournit les deux listes liées `SessionsSatisfaction` et `ReponsesSatisfaction`, les colonnes, les expressions Power Automate, le contrôle du secret et les tests de connexion. Les listes et le flux restent à créer dans Microsoft 365. Supabase conserve la gestion transactionnelle et la garantie de soumission unique.

### Envoi après chaque réponse

1. Créer le flux avec le déclencheur **Lors de la réception d’une requête HTTP** et utiliser [schema-declencheur.json](docs/powerautomate/schema-declencheur.json). L’application accepte une URL HTTPS signée et un secret d’en-tête ; elle ne fournit pas de jeton OAuth Entra automatique. Respecter les règles du tenant si le mode URL signée est interdit.
2. `npm run powerautomate:config -- --init-secret` crée un secret dédié dans `.env.local` sans l’afficher. Le vérifier dans le flux via `x-webhook-secret`. Renseigner ensuite l’URL complète du déclencheur dans `POWER_AUTOMATE_WEBHOOK_URL`, puis redémarrer l’application.
3. Le flux enregistre les indicateurs dans `SessionsSatisfaction` et la réponse dans `ReponsesSatisfaction`, avec une colonne de recherche vers la session. Les identifiants métier `SessionId` et `EventId` sont uniques dans leurs listes respectives.
4. Dédupliquer par `eventId`, contrôler `sessionVersion` pour ne pas écraser les statistiques récentes et activer une exécution à la fois sur ce flux dédié.
5. Après les écritures, répondre **HTTP 200**, JSON `{"received":true,"eventId":"..."}` avec l’identifiant reçu. Un simple 202 automatique n’est pas accepté comme confirmation. Les échecs restent dans la file de reprise.
6. `npm run powerautomate:test` envoie un **test réel fictif** à SharePoint ; relancer la commande doit conserver une seule réponse. Puis utiliser le bouton de reprise dans **Intégrations** pour les réponses existantes.

Le payload sortant v2 est disponible dans [exemple-reponse.json](docs/powerautomate/exemple-reponse.json). Il contient le nom et la date de formation, les identifiants, le formateur, le nom/prénom/e-mail, les réponses et commentaires, la note finale sur 4, les pourcentages de satisfaction et le taux de participation de session. Les scores inexistants sont `null`. Les notes sur 5/10 sont normalisées sur 4, comme les rapports. Un événement `satisfaction.session` met aussi à jour la synthèse après un import ou une modification de session déjà répondue.

L’exemple minimal historique ci-dessous concerne uniquement le récepteur **entrant** v1 ; pour le flux sortant, utiliser les fichiers v2 du guide.

```json
{
  "eventId": "68490212-927a-4f36-977a-c9db2df4c211",
  "sessionId": "DORA-2026-001",
  "participantId": "9328afca-d3ce-4ca0-80fc-38b12338cc43",
  "nom": "Dupont",
  "prenom": "Jean",
  "email": "jean@example.com",
  "submittedAt": "2026-12-11T10:00:00.000Z",
  "answers": [
    {
      "questionId": "938dcd92-1456-42d5-9e3f-50296f4bb49d",
      "label": "La formation correspondait globalement à mes attentes",
      "type": "RATING_4",
      "value": 4,
      "comment": "La formation correspondait à mes attentes."
    }
  ]
}
```

`WebhookDelivery` est une outbox persistante créée dans la transaction de soumission, même si aucun flux n’est encore configuré. L’application tente l’envoi après la réponse HTTP à l’utilisateur via `after()`. Un échec ne remet jamais le formulaire en état utilisable. Les événements historiques sont enrichis avant livraison. Reprises exponentielles de 1 min à 24 h, verrou de livraison 120 s et timeout réseau 45 s. L’URL du flux et ses secrets ne sont pas journalisés. Le header `Idempotency-Key` reprend `eventId` ; la livraison est **au moins une fois**, le destinataire doit donc dédupliquer.

`GET /api/cron/webhooks` exige `Authorization: Bearer <CRON_SECRET>`, traite jusqu’à 5 événements éligibles et nettoie les limites expirées. Le cron Vercel fourni s’exécute quotidiennement à 06:00 UTC ; augmentez la fréquence selon le plan Vercel et le volume. Le bouton de reprise dans Intégrations est réservé à l’administrateur et réessaie 5 événements par appel.

### Réception depuis Power Automate

`POST /api/webhook/powerautomate` reçoit un événement au format historique v1 de l’exemple réduit ci-dessus avec `x-webhook-secret` égal à `POWER_AUTOMATE_INBOUND_SECRET`. Les appels sont idempotents sur `eventId` et stockés dans `IntegrationEvent`. Ce récepteur est distinct du flux sortant v2 ; il ne soumet pas de questionnaire, ne contourne pas l’usage unique et n’envoie pas de nouvel événement sortant.

Les invitations peuvent être envoyées par Mailgun SMTP depuis l’application, ou par un flux distinct à partir de l’export Excel des liens. Les liens personnels exportés doivent rester confidentiels.

## API REST

L’onglet **Collaboration**, réservé aux administrateurs, permet d’inviter un collègue par e-mail, de lui attribuer le rôle Manager ou Administrateur et de désactiver ses accès. Invitation personnelle valable 7 jours, mot de passe choisi à l’activation. Le Manager peut gérer les formations et supprimer une session archivée avec confirmation, sans gérer les comptes ou les réglages globaux. Voir [les rôles et invitations](docs/exploitation-production.md#collaboration-et-rôles).

- Guide : `/docs`
- Spécification OpenAPI 3.0.3 : `/api/openapi` (importable dans Postman/Swagger Editor)
- Connexion : `/login`, via NextAuth et son endpoint CSRF.
- API admin : cookie NextAuth requis. Les mutations JSON attendent `Content-Type: application/json` et `Origin` identique à l’origine de `NEXTAUTH_URL`. Le navigateur envoie cet en-tête automatiquement.

| Méthode              | Route                                           | Usage                                                                                                                                                |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET / POST           | `/api/sessions`                                 | Liste / création                                                                                                                                     |
| GET / PATCH / DELETE | `/api/sessions/{id}`                            | Détail / modification ou archivage / suppression                                                                                                     |
| POST                 | `/api/sessions/import-participants`             | Multipart `sessionId` + `file`                                                                                                                       |
| GET                  | `/api/participants?sessionId=…&page=1`          | Participants, 100 par page, sans tokens                                                                                                              |
| GET                  | `/api/participants/{id}/link`                   | Lien et QR Code, participant en attente                                                                                                              |
| GET                  | `/api/sessions/{id}/export?format=xlsx`         | Liens Excel ; `format=pdf` : fiches avec le modèle mémorisé pour la session, une page par participant. `templateId` permet un remplacement ponctuel. |
| PUT                  | `/api/sessions/{id}/pdf-template`               | Mémoriser le choix du modèle pour cette session : JSON `{templateId}`                                                                                |
| GET / POST           | `/api/pdf-templates`                            | Liste des modèles / création                                                                                                                         |
| PUT / DELETE         | `/api/pdf-templates/{id}`                       | Modification complète / suppression d’un modèle personnalisé                                                                                         |
| POST                 | `/api/pdf-templates/preview`                    | Aperçu PDF fictif, JSON `{template, sessionId?}`                                                                                                     |
| GET                  | `/api/template`                                 | Modèle Excel                                                                                                                                         |
| GET                  | `/api/responses?sessionId=…&page=1`             | Réponses, 100 par page                                                                                                                               |
| POST                 | `/api/submit`                                   | Soumission unique, sans compte administrateur                                                                                                        |
| GET                  | `/api/statistics?sessionId=…`                   | Statistiques et résultats                                                                                                                            |
| GET                  | `/api/exports?format=xlsx&sessionId=…`          | Rapport Excel ou `pdf`                                                                                                                               |
| GET / POST           | `/api/integrations`                             | État / reprise des envois                                                                                                                            |
| GET                  | `/api/integrations/powerautomate?format=schema` | Schéma HTTP du flux ; `format=example` pour l’exemple fictif                                                                                         |
| POST                 | `/api/webhook/powerautomate`                    | Réception authentifiée d’événements                                                                                                                  |
| GET                  | `/api/cron/webhooks`                            | Reprises, authentification Bearer                                                                                                                    |

Principaux codes : 400 validation, 401 connexion requise, 403 accès/origine refusé, 404 inconnu, 409 conflit ou réponse déjà soumise, 410 session fermée/lien consommé pour l’export individuel, 413 taille excessive, 429 limite, 503 indisponibilité.

## Déployer sur Vercel

Voir aussi [les contrôles et limites d’exploitation](docs/exploitation-production.md) : rôle PostgreSQL dédié, exports, planification et rotation des secrets.

1. Importer le dépôt GitHub dans Vercel. Framework Next.js, Node.js 22, commande de build `npm run build`. `package-lock.json` est fourni. Les variables d’environnement, fichiers de test locaux et données réelles doivent rester exclus du dépôt, même lorsqu’il est public.
2. Définir dans Vercel `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL` (URL HTTPS définitive), `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` et `CRON_SECRET`. Ajouter les variables Mailgun et Power Automate si utilisées. Pour une même base Supabase, conserver exactement `TOKEN_ENCRYPTION_KEY` pour relire les liens existants. Une base de production séparée peut utiliser des secrets distincts. Désactiver `ENABLE_DEMO` en production. Voir [la séparation GitHub / Vercel / secrets locaux](docs/publication-securite.md).
3. Exécuter `npm run db:migrate` depuis un poste ou une étape CI disposant des variables de la base cible, **avant** de servir l’application. Les migrations ne s’exécutent pas automatiquement dans le build pour éviter les courses entre déploiements.
4. Créer le compte admin sur cette même base avec `npm run db:admin`. Ne pas conserver le mot de passe dans les variables Vercel après initialisation.
5. Déployer, vérifier la connexion, créer une session test, importer un participant, soumettre son lien et tester une deuxième tentative.
6. Configurer le flux Power Automate et vérifier une création SharePoint réelle, puis vérifier la reprise après une panne simulée.

Les connexions PostgreSQL Supabase doivent autoriser les connexions de Vercel. Ne mettez aucune clé serveur dans une variable `NEXT_PUBLIC_*`. Prévoir une offre et des limites de fonctions adaptées aux exports PDF et au volume de réponses. `vercel.json` fournit le cron ; `maxDuration` est défini sur les routes longues.

## Vérifications

```powershell
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run build
```

- Tests unitaires : types de questions, notes sur 4 étoiles et anciennes échelles, commentaires facultatifs, bornes, champs requis, token/chiffrement, import Excel et archives trop volumineuses.
- Tests d’intégration : PostgreSQL embarqué **local et temporaire**, sans utiliser `DATABASE_URL` distant ; migrations, 8 soumissions simultanées, refus après réponse, session fermée, mauvaise session, statistiques, rate limit atomique, panne webhook et RLS. Le port local 55439 doit être libre. Les données de test sont supprimées après arrêt.
- Les tests de PostgreSQL embarqué nécessitent l’exécution de binaires locaux et les scripts d’installation npm. En environnement Linux root, exécuter les tests avec un utilisateur non root ; le projet ne crée pas d’utilisateur système.
- Le test navigateur utilise Edge déjà installé, en mode sans fenêtre, et un serveur local sur le port 3101. Pour Chrome, définir `PLAYWRIGHT_CHANNEL=chrome`. Il vérifie les vues desktop/mobile, la connexion, la création, l’import, le formulaire, l’usage unique, les exports et les contrôles d’accès. Les captures sont enregistrées dans `test-results/` (ignoré par Git). Il utilise exclusivement une base PostgreSQL locale temporaire sur un port disponible.
- `npm run check:login -- --pdf` vérifie la connexion réelle, la liste des modèles, l’aperçu et, si une session contient des participants, le nombre de pages de son export PDF. Ce contrôle ne soumet aucun questionnaire et ne crée aucun participant ni modèle.
- Les actions réelles SharePoint restent à valider avec votre flux Power Automate.

## Références

- [Identité et logo officiels House of Training](https://www.houseoftraining.lu/) : SVG d’en-tête conservé dans `public/house-of-training.svg`, palette inspirée du rose et du violet du logo.
- [Installation Next.js](https://nextjs.org/docs/app/getting-started/installation).
- [NextAuth Credentials](https://next-auth.js.org/providers/credentials).
- [Prisma 6 et Supabase](https://www.prisma.io/docs/orm/v6/overview/databases/supabase).
- [Connexions Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [SheetJS : source officielle 0.20.3](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), utilisée à la place de la version obsolète du registre npm.
