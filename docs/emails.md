# Invitations et rappels de satisfaction

Dans **Paramètres → Invitations et rappels par e-mail**, définir le délai après la date de fin de formation : **1 jour** par défaut, **7 jours** pour une semaine. Activer ensuite le calendrier général. L’installation laisse cette activation désactivée et n’envoie aucun message.

Dans **Nouvelle session** ou **Modifier**, le calendrier propose :

- **Utiliser le réglage par défaut** : suit les modifications des paramètres généraux.
- **Personnaliser le délai** : par exemple 7 jours pour cette session.
- **Désactiver l’envoi automatique** : conserve les possibilités manuelles.

Seules les sessions **actives** sont concernées. La date est calculée en jours calendaires, selon **Europe/Luxembourg**. Chaque participant sans réponse reçoit **un seul envoi automatique par session**. Il n’y a pas de rappel récurrent quotidien. L’activation générale inclut aussi les anciennes sessions actives dont la date d’envoi est déjà dépassée. Une modification du calendrier s’applique aux messages automatiques encore en attente, sans renvoyer ceux déjà traités.

## Envoi manuel

Dans une session, **Envoyer aux non-répondants** cible toutes les personnes n’ayant pas répondu. Dans la ligne d’un participant, **Envoyer un e-mail** cible uniquement cette personne. Une fenêtre précise la session et les destinataires ; **Annuler** ne met rien en file et **Confirmer l’envoi** lance le traitement.

Le serveur revérifie les réponses au traitement. Les personnes qui ont déjà répondu sont exclues. Les messages en attente, en cours ou sans confirmation bloquent une nouvelle mise en file pour le participant ; un délai de cinq minutes après un envoi accepté empêche les doubles clics. Après un échec SMTP confirmé avant envoi, une nouvelle tentative manuelle est possible. Après une perte de confirmation, vérifier dans Mailgun avant toute intervention : aucun renvoi automatique incertain.

L’envoi manuel reste possible lorsque le calendrier automatique est désactivé. Il ne consomme pas l’envoi automatique futur prévu par le calendrier. Le ciblage individuel concerne uniquement le mode manuel.

Chaque destinataire reçoit un e-mail distinct, son prénom, le nom et la date de formation, et un bouton **Répondre au questionnaire** vers son lien personnel à usage unique. Le message contient aussi une version texte. Aucun nom, e-mail ou lien personnel n’est exposé aux autres participants.

Le modèle de production utilise le logo House of Training, les couleurs rose et violet, les informations de session (formation, date, formateur et référence), le message « Votre avis fait la différence » et un lien de secours visible sous le bouton. Il ne présente pas les réponses comme anonymes. Le logo PNG est chargé depuis l’adresse publique de l’application ; le message reste lisible lorsque les images sont masquées. La mise en page repose sur des tableaux et styles intégrés, avec une adaptation mobile ; son rendu exact dépend du logiciel de messagerie.

`npm run email:preview` génère un aperçu autonome avec identité et lien fictifs dans `test-results/apercu-email-invitation.html`, ainsi qu’une version texte `.txt`. Ce modèle est utilisé pour les invitations automatiques et manuelles des sessions. L’e-mail technique `email:test:send` conserve un message de test distinct. La génération de l’aperçu n’envoie aucun e-mail et ne modifie pas les participants.

## Mailgun et Supabase

Le SMTP configuré dans **Supabase Authentication** sert aux messages d’authentification Supabase ; il ne fournit pas une API d’envoi de questionnaires. Cette application utilise NextAuth pour la connexion des administrateurs et PostgreSQL Supabase pour les données.

L’adaptateur SMTP de l’application utilise les variables serveur suivantes, à renseigner dans `.env.local` et dans Vercel si ce mode d’envoi est retenu :

```dotenv
SMTP_HOST="smtp.eu.mailgun.org"
SMTP_PORT="587"
SMTP_USER="postmaster@DOMAINE_MAILGUN"
SMTP_PASSWORD="MOT_DE_PASSE_SMTP_MAILGUN"
EMAIL_FROM="ADRESSE_EXPEDITEUR_AUTORISEE"
```

Le port 587 impose STARTTLS et le port 465 utilise TLS immédiat. Les serveurs SMTP Mailgun Europe et US sont acceptés. Ne pas utiliser une clé publique Supabase, le mot de passe PostgreSQL ou une clé API Mailgun à la place du mot de passe SMTP. L’expéditeur doit correspondre à un domaine autorisé dans Mailgun. Un domaine sandbox Mailgun nécessite des destinataires autorisés.

L’application doit disposer d’une adresse publique **HTTPS**, définie dans `NEXTAUTH_URL`. Les envois sont bloqués si cette adresse est encore `localhost`. Le panneau affiche séparément l’état des identifiants et de l’adresse publique ; la présence des paramètres ne prouve pas la validité des identifiants SMTP.

Une architecture avec une **Edge Function Supabase et l’API Mailgun** est une autre intégration possible ; le simple réglage SMTP de Supabase Auth ne l’installe pas.

Documentation : [SMTP Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp), [envoi SMTP Mailgun](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-smtp).

## Exécution et suivi

Pour tester uniquement la réception, même avant de disposer d’une URL publique : `npm run email:test` vérifie la présence des paramètres sans envoyer de message ; `npm run email:test:send` envoie **un seul e-mail à ADMIN_EMAIL** avec un bouton vers l’application. Aucun participant, questionnaire ou calendrier n’est modifié. Ce test n’ouvre pas les envois automatiques ou manuels des sessions aux liens locaux. Vérifier la boîte de réception et les indésirables ; une acceptation SMTP ne prouve pas la réception finale. En cas de confirmation incertaine, ne pas relancer avant vérification dans Mailgun.

La tâche existante `GET /api/cron/webhooks`, protégée par `CRON_SECRET`, met en file les échéances et traite les messages. Le déploiement Vercel actuel l’exécute quotidiennement à **06:00 UTC** : l’e-mail part au passage de la tâche le jour prévu, pas à une heure de formation précise. En local, aucun service de planification n’est installé automatiquement.

Chaque passage met en file au maximum 100 invitations automatiques et traite au maximum 100 messages, avec un budget de traitement limité. Un reste en attente est repris au prochain passage. Pour un volume dépassant ces limites ou pour une reprise plus rapide, configurer un ordonnanceur plus fréquent qui appelle cette route avec son secret ; une fréquence plus élevée dans Vercel peut dépendre du forfait.

Les compteurs distinguent **en attente**, **en cours**, **accepté par Mailgun**, **échec avant envoi** et **à vérifier**. « Accepté » signifie que le serveur SMTP a accepté le message ; cela ne garantit pas sa réception dans la boîte du destinataire. Le statut d’envoi n’est jamais utilisé pour marquer le questionnaire comme répondu.

## Formations sur plusieurs jours

Chaque session possède une **date de début** (`date`) et une **date de fin** (`endDate`). Pour une formation d’une journée, conserver la même date dans les deux champs. La date de fin ne peut pas précéder le début ; ce contrôle est appliqué dans le formulaire, l’API et PostgreSQL.

Les délais automatiques J+1, J+7, etc. partent de la **dernière journée de formation**, en calendrier Europe/Luxembourg. Par exemple, du lundi 7 au jeudi 10 décembre 2026 : J+1 correspond au vendredi 11 décembre. Reporter la fin reporte aussi les invitations automatiques encore en attente. Les messages déjà envoyés ne sont pas renvoyés et un envoi manuel explicite reste possible avant la fin. Un message dont la transmission SMTP a déjà commencé peut terminer son envoi.

La migration `202610220005_session_end_date` reprend la date actuelle comme date de fin pour toutes les sessions existantes. Les anciens imports sans date de fin restent compatibles et représentent une journée. La période complète s’affiche dans la liste et la fiche de session, le questionnaire participant, les invitations e-mail et les fiches PDF.

## Suivi par participant

Dans le tableau des participants (fiche de session et vue Participants), la colonne **Suivi e-mail** indique si la personne a été contactée, la date du dernier envoi confirmé et le nombre d’envois. Une nouvelle tentative en attente ou en échec ne masque pas les envois déjà confirmés. **Historique** affiche les tentatives automatiques et manuelles, leur préparation, leur statut et leur date d’envoi, en heure de Luxembourg. Les envois en attente se mettent à jour toutes les dix secondes lorsque le tableau est ouvert ; l’historique possède un bouton Actualiser. Une confirmation d’envoi individuel rappelle la date du précédent contact.

Cet historique est réservé aux collaborateurs autorisés (`GET /api/participants/{id}/emails`, 20 tentatives par page). Il concerne les messages liés aux participants ; le test technique `email:test:send` reste indépendant et n’y apparaît pas. Les états de prise en charge SMTP et de livraison sont distingués.

## Livraison réelle : configuration Mailgun Europe

Le SMTP ne fournit pas à lui seul la confirmation de livraison. L’application reçoit désormais les événements signés de Mailgun sur :

```text
https://customer-satisfaction-omega.vercel.app/api/webhook/mailgun
```

Pour activer le suivi :

1. Dans Mailgun, ouvrir **Settings → API Security → HTTP webhook signing key**. Copier cette clé en privé ; ce n’est ni le mot de passe SMTP, ni la clé API. Ajouter `MAILGUN_WEBHOOK_SIGNING_KEY` aux variables serveur de **Vercel Production**, puis redéployer. Pour un test local, définir cette variable dans `.env.local` et utiliser un tunnel HTTPS privé.
2. Dans la configuration **Webhooks** du domaine d’envoi, sélectionner la région **Europe / EU**. Conserver les webhooks existants des autres applications.
3. Ajouter l’URL ci-dessus aux événements **Delivered**, **Temporary failure** et **Permanent failure**. **Accepted** est également pris en charge, mais facultatif puisque l’accusé SMTP confirme déjà l’acceptation. Selon l’interface Mailgun, les erreurs apparaissent aussi sous « failed » avec une sévérité temporary/permanent.
4. Depuis l’application, envoyer manuellement une invitation à une adresse de test choisie, puis **Actualiser le suivi des e-mails**. Les nouveaux envois enregistrent leur identifiant de message avant SMTP ; le webhook retrouve la tentative exacte et vérifie aussi le destinataire. Le bouton de test générique Mailgun utilise un message fictif inconnu : son acquittement HTTP 200 vérifie seulement la réception du webhook, sans modifier un participant.

Les statuts sont **Accepté par Mailgun**, **Livré au serveur destinataire**, **Livraison différée** et **Rejeté / non livré**. Un rejet permanent peut provenir d’une adresse inexistante, d’un refus du serveur ou d’une suppression Mailgun ; il ne prouve pas toujours que l’adresse est invalide. « Livré » ne garantit ni la lecture, ni l’absence de classement en indésirables. Aucun suivi d’ouverture ou de clic n’est ajouté.

La signature HMAC est comparée en temps constant, avec une fenêtre de 24 heures pour permettre les reprises du fournisseur. Les événements sont dédupliqués en base. Un ancien événement « accepted » ou différé ne remplace jamais un état terminal ; les événements terminaux sont comparés selon leur date. Une confirmation signée peut résoudre un envoi SMTP « À vérifier », sans nouvelle émission. Aucun renvoi automatique n’est déclenché par le webhook. Les événements conservés contiennent seulement un identifiant haché, l’ID de tentative, un type et une date ; aucun contenu du message, token participant ou signature n’est stocké.

Les envois historiques restent « acceptés » tant qu’aucune livraison n’est confirmée ; il n’y a pas de récupération rétroactive des événements. La suppression d’une session efface ses événements en cascade. Les invitations de collaboration et les tests SMTP techniques restent indépendants du suivi des participants.

Références : [configuration des webhooks et régions](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/configuring-webhooks), [signature des événements](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks), [sens des statuts Mailgun](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks).

## Clôture des réponses sans archivage

Dans **Nouvelle session** ou **Modifier**, renseigner **Date limite de réponse**. Ce champ facultatif accepte les réponses jusqu’à la fin du jour choisi, en heure **Europe/Luxembourg**, y compris aux changements d’heure. Aucune tâche planifiée n’est nécessaire pour fermer les réponses : l’accès au formulaire et chaque soumission sont contrôlés côté serveur, sous verrou de session pour la soumission.

La session conserve son statut et ses résultats ; elle peut rester **Active** avec une **Collecte clôturée**. Les réponses déjà reçues, rapports, exports et transmissions Odoo restent accessibles. Les invitations manuelles et automatiques ne partent plus après échéance. Les messages en attente restent conservés et pourront reprendre au traitement suivant si la date est prolongée ou retirée. Les messages dont la transmission a déjà commencé ne peuvent pas être rappelés. L’archivage et ses choix de reprise des e-mails restent indépendants.

Une date déjà passée permet de fermer immédiatement la collecte. Prolonger la date ou la retirer rouvre les liens non utilisés si la session est active ; les liens déjà complétés restent définitivement inactifs. Les sessions existantes ne reçoivent aucune limite par défaut. L’API accepte `responseDeadline: "AAAA-MM-JJ"`, `null` pour retirer, et conserve la valeur si le champ est omis en modification.

## Archivage et réactivation

L’archivage est autorisé même s’il reste des e-mails non envoyés et même si Mailgun n’est pas configuré. Il suspend immédiatement les messages en attente et bloque les nouvelles invitations automatiques. Le suivi les affiche comme **Suspendus**. Un message dont la transmission SMTP est déjà commencée peut toutefois terminer son envoi ; un e-mail déjà transmis ne peut pas être rappelé.

**Réactiver la session** demande un choix explicite, également proposé dans l’éditeur si le statut quitte **Archivée** :

- **Conserver les e-mails suspendus**, sélectionné par défaut : la session est réouverte, les messages restent en pause et les nouveaux participants ne sont pas automatiquement contactés.
- **Reprogrammer les e-mails non envoyés** : choisir une date de reprise (demain par défaut, aujourd’hui ou plus tard autorisé). Les messages suspendus des non-répondants redeviennent disponibles à partir de cette date ; le calendrier de formation et l’activation générale restent applicables aux invitations automatiques. La réactivation elle-même n’envoie aucun e-mail. Les confirmations et envois incertains ne sont jamais remis en file.

Après avoir conservé la suspension, **Reprogrammer les e-mails suspendus**, dans la fiche de la session active, permet de revenir sur ce choix. Les nouveaux envois manuels explicites restent disponibles ; la reprise déduplique les messages suspendus si un envoi plus récent a déjà été préparé ou confirmé pour le même participant. Le serveur exige ce choix pour la réactivation, même si l’interface est contournée. Les anciennes sessions sans calendrier peuvent être modifiées ou archivées avec `emailSchedule: null`.

La suppression d’une session efface également son calendrier et ses traces d’e-mails locales ; elle est bloquée lorsqu’un envoi possède un verrou actif. Les messages déjà transmis à Mailgun restent dans le service externe.

API administrateur documentée dans `/api/openapi` : `GET/PUT /api/settings/email`, `GET/POST/PUT /api/sessions/{id}/emails`. La configuration par session est enregistrée via `emailSchedule` dans les API de création et de modification. Pour la réactivation, `PATCH /api/sessions/{id}` exige `emailReactivation: {action:"KEEP_PAUSED"}` ou `{action:"RESCHEDULE",date:"AAAA-MM-JJ"}`. Le `PUT` du suivi des e-mails accepte directement ce même objet pour une session active. Aucun identifiant SMTP, mot de passe ou token participant n’est retourné par le suivi.
