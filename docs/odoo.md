# Envoi des évaluations à Odoo, par session

Chaque session peut enregistrer son propre lien de questionnaire Odoo. Aucun token n’est à copier séparément et aucune variable d’environnement Odoo n’est nécessaire pour une nouvelle session.

## Utilisation

1. Ouvrir **Sessions de formation → Nouvelle session** ou **Modifier** une session existante.
2. Au début du formulaire, dans **Lien Odoo et préremplissage**, coller le **Lien du questionnaire Odoo** complet. À la création, la page est lue automatiquement et préremplit le nom de la formation et du formateur. Les corrections saisies manuellement sont conservées ; changer le lien efface seulement les anciennes valeurs automatiques. L’identifiant est repris uniquement lorsqu’une métadonnée de session explicite et cohérente est présente ; sinon, il reste à saisir manuellement. Le UUID du lien et les numéros de questions ne sont jamais utilisés comme identifiant de session.
3. Laisser **Activer l’envoi automatique des évaluations vers Odoo** coché pour transmettre chaque nouvelle réponse après son enregistrement local.
4. **Vérifier le lien Odoo** permet de relire la page ou de réessayer après une erreur. Sur une session existante, cette vérification conserve ses informations enregistrées. La lecture ne soumet aucune évaluation et peut précéder la sauvegarde de la session. La date reste à renseigner manuellement.
5. Enregistrer. Dans la fiche de session, **Envoi manuel vers Odoo** permet le rattrapage des réponses déjà enregistrées. Une fenêtre rappelle la session, l’environnement et le rôle de ce bouton ; **Confirmer l’envoi manuel** lance le traitement et **Annuler** ferme la fenêtre sans envoi. Deux réponses au maximum sont traitées par passage ; les compteurs indiquent celles qui restent en attente.

La sauvegarde d’une session ne transmet pas de réponse à Odoo. La transmission se produit lors d’une nouvelle soumission participant si l’intégration est active, ou après le bouton d’envoi. Le bouton de vérification effectue seulement un GET. La désactivation conserve le lien et suspend les transmissions ; vider le champ puis enregistrer retire le lien actif. Une session sans intégration reste utilisable.

## Liens et confidentialité

Origines HTTPS autorisées :

- `https://odoo.uat.houseoftraining.lu/session/satisfaction/<UUID>` : préproduction ;
- `https://www.houseoftraining.lu/session/satisfaction/<UUID>` : production.

Le POST utilise toujours le même domaine que le lien enregistré. Les URL avec identifiants, paramètres, fragments ou autres domaines sont refusées. Les redirections ne sont pas suivies.

Le lien est chiffré dans `OdooConnection`, liée à la session, protégée par RLS et sans droits publics Supabase. Conserver `TOKEN_ENCRYPTION_KEY` lors des déploiements. Le lien est retourné uniquement à l’administrateur ouvrant l’éditeur (`includeUrl=true`), jamais dans les listes de sessions, les données participants ou le suivi standard. Les cookies et le CSRF restent en mémoire serveur pendant l’appel.

Le lien détermine la destination dans Odoo. L’identifiant de notre session n’a pas besoin d’être un identifiant numérique Odoo. La vérification affiche la formation réellement associée au lien pour contrôler ce choix. La confirmation publique Odoo ne donne pas l’identifiant interne de l’évaluation créée.

## Récupération automatique et envoi

Avant chaque POST, le serveur lit la page du lien enregistré, récupère les champs cachés `access_token` et `csrf_token`, et conserve le cookie HTTP `session_id`. Il vérifie le token, les quinze champs attendus et le barème à quatre étoiles. Les identifiants numériques des champs sont découverts par leurs libellés : ils ne sont pas supposés identiques entre les formulaires.

L’envoi utilise un POST JSON plat vers `/session/satisfaction`, comme le JavaScript du formulaire Odoo testé. Une réponse HTTP 200 seule ne suffit pas : `result.success` doit être strictement `true`, sans erreur.

Sont transmis : prénom, nom, e-mail, onze notes sur quatre, commentaires associés et suggestions. Un questionnaire personnalisé ou un barème incompatible bloque l’envoi avant POST. Un commentaire est requis pour une note de 1 ou 2 étoiles dans les sessions intégrées, selon le seuil du formulaire Odoo ; cette règle est validée avant de consommer le lien participant.

La note finale et le pourcentage sont calculés dans l’application. Le formulaire public Odoo n’expose pas de champs pour les écrire séparément ; les agrégats d’Odoo dépendent de son module.

## Suivi et doublons

Chaque réponse possède un envoi unique `odoo:<responseId>` dans `WebhookDelivery`, distinct des événements Power Automate. Une défaillance d’Odoo conserve la réponse locale et ne réactive pas le formulaire participant.

| État | Comportement |
|---|---|
| `PENDING` | Attend son traitement. |
| `VERIFYING` | Lecture et validation de la page, avec verrou temporaire. |
| `POSTING` | Enregistré avant le POST ; aucun renvoi après expiration du verrou. |
| `SENT` | Odoo a confirmé `result.success: true` ; jamais réémis. |
| `FAILED` | Échec avant POST ; reprise possible. |
| `UNKNOWN` | POST sans confirmation fiable ; vérifier dans Odoo avant une réconciliation manuelle. |

Pour remplacer un lien invalide, enregistrer son remplaçant dans la session puis utiliser **Envoi manuel vers Odoo**, après confirmation. Les réponses jamais postées peuvent être remises en file pour le nouveau lien ; les réponses confirmées ou incertaines restent protégées. Modifier ou désactiver le lien pendant sa lecture empêche le POST de l’ancien processus.

La durée de validité et le nombre de soumissions acceptées dépendent du module Odoo. L’application ne peut pas réactiver un lien révoqué ni déduire son remplaçant depuis l’ancien. Elle conserve les réponses et signale le refus. L’en-tête `Idempotency-Key` ne garantit pas une déduplication côté Odoo ; les états incertains ne sont pas réémis automatiquement.

Le cron `/api/cron/webhooks` traite deux réponses Odoo par passage, à la fréquence de `vercel.json`. En local, les nouvelles soumissions et le bouton administrateur déclenchent le traitement sans attendre un cron.

## Déploiement et compatibilité

Appliquer `npm run db:migrate` avant de servir cette version. La migration `202610220001_odoo_per_session` crée `OdooConnection` et ses protections. La connexion Supabase et `TOKEN_ENCRYPTION_KEY` doivent être présentes dans l’environnement Vercel.

La configuration historique `ODOO_UAT_*` de l’essai 203238 reste prise en charge tant que cette session n’a pas de configuration enregistrée en base. Sauvegarder son lien ou sa désactivation donne priorité à la configuration de session. Les nouvelles sessions se configurent depuis l’interface. L’évaluation technique déjà confirmée n’est pas renvoyée.

## API administrateur

Routes documentées dans `/api/openapi`, protégées par NextAuth, contrôle `Origin` pour les mutations et limitation des appels :

- `POST /api/sessions`, `PATCH /api/sessions/{id}` : champs facultatifs `odooUrl` et `odooEnabled`. Les omettre en modification conserve la configuration.
- `GET /api/sessions/{id}/odoo` : suivi sans lien ni tokens.
- `GET /api/sessions/{id}/odoo?includeUrl=true` : lien et activation réservés à l’éditeur administrateur.
- `POST /api/odoo/verify` : `{ "url": "..." }` ou `{ "sessionId": "..." }`, lecture seule.
- `POST /api/sessions/{id}/odoo` : mettre les réponses en attente dans la file et traiter cette session.

Les commandes historiques `npm run odoo:prepare` et `npm run odoo:test` concernent uniquement l’essai fictif 203238. Elles ne sont pas nécessaires pour une nouvelle session.
