# Dépôt public et déploiement Vercel

## À conserver hors de GitHub et des fichiers déployés

- `.env.local` et les autres fichiers `.env` contenant des valeurs réelles.
- Mots de passe, clés privées, identifiants de service, URL signées Power Automate, liens et tokens Odoo ou participants.
- Exports Excel/PDF/CSV, fichiers importés, sauvegardes de base, captures d’écran, journaux et rapports contenant des données réelles.
- Identifiants personnels du compte administrateur et configuration locale du tenant.

`.gitignore` exclut ces fichiers et les dossiers locaux générés. `.vercelignore` protège aussi les déploiements effectués depuis les fichiers locaux avec la CLI. Un déploiement Git ne doit recevoir que les fichiers contrôlés et publiés dans le dépôt. Ne pas contourner les exclusions avec `git add -f`. Seul `.env.example`, rempli d’exemples sans valeurs privées, est versionné.

Les exemples de tests du dépôt utilisent des données fictives et des tokens factices. Les adresses des services autorisés dans le code ne constituent pas des secrets ; les liens personnels et leurs tokens le sont.

## À configurer côté serveur sur Vercel

Dans les variables d’environnement du projet, renseigner les valeurs nécessaires, en type **Secret** pour les identifiants sensibles :

| Usage                                   | Variables                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PostgreSQL                              | `DATABASE_URL`, `DIRECT_URL` pour les migrations                                               |
| Authentification et chiffrement         | `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`                                                      |
| Tâche planifiée                         | `CRON_SECRET`                                                                                  |
| Mailgun, si utilisé                     | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`                           |
| Power Automate, si utilisé              | `POWER_AUTOMATE_WEBHOOK_URL`, `POWER_AUTOMATE_WEBHOOK_SECRET`, `POWER_AUTOMATE_INBOUND_SECRET` |
| Configuration publique de l’application | `NEXTAUTH_URL` : URL HTTPS définitive ; `ENABLE_DEMO=false`                                    |

Ne jamais préfixer un secret par `NEXT_PUBLIC_` : Next.js l’intégrerait au code du navigateur. La clé Supabase publishable et l’URL publique du projet sont publiques par nature et facultatives ici ; elles ne remplacent pas les connexions Prisma.

Les variables `ADMIN_EMAIL`, `ADMIN_NAME` et `ADMIN_PASSWORD` servent à l’initialisation locale du compte (`npm run db:admin`). Elles ne sont pas nécessaires au fonctionnement du login après création du compte en base. En particulier, ne pas stocker `ADMIN_PASSWORD` sur Vercel.

Pour utiliser la **même base Supabase que l’installation locale**, conserver exactement `TOKEN_ENCRYPTION_KEY`. La changer rendrait illisibles les liens participants et configurations Odoo déjà chiffrés. Une base de production indépendante peut avoir ses propres secrets. Les déploiements Preview doivent utiliser une base séparée et des connexions d’intégration de test, afin de ne pas agir sur les données ou destinataires réels.

Les liens Odoo se configurent depuis l’administration et sont chiffrés en base. Ne pas publier leurs valeurs dans les exemples, captures ou logs. Les chemins `/form/*` contiennent des tokens : masquer ces chemins dans les outils d’observabilité et éviter les captures d’URL personnelles.

## Déploiement

1. Importer le dépôt dans Vercel et sélectionner Node.js 22 / Next.js.
2. Renseigner les variables du projet ; ne pas téléverser `.env.local` dans les sources.
3. Appliquer les migrations depuis un poste autorisé : `npm run db:migrate`. Ne pas ajouter de migration automatique vers la base réelle lors de chaque déploiement Preview.
4. Déployer avec `npm run build`, puis vérifier le login et une session de test sans envoi réel non souhaité.

Références : [variables d’environnement Vercel](https://vercel.com/docs/environment-variables), [types Config et Secret](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types), [variables Next.js](https://nextjs.org/docs/app/guides/environment-variables).
