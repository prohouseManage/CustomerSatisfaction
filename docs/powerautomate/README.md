# Connexion Power Automate → SharePoint

Site cible à adapter, par exemple : https://YOUR_TENANT.sharepoint.com/sites/Formation

L’application envoie un POST HTTPS au déclencheur Power Automate. Le flux utilise votre connexion Microsoft 365 pour enregistrer les données dans les deux listes ci-dessous. Le compte Microsoft doit pouvoir créer les listes ou écrire dans les listes créées par le propriétaire du site. Les listes et le flux ne sont pas créés par les fichiers de ce dossier.

## 1. Créer les deux listes

Sur le site cible : **Contenu du site → Nouveau → Liste → Liste vide**. Créer d’abord `SessionsSatisfaction`, puis `ReponsesSatisfaction`. Utiliser ces noms sans accents pour faciliter le paramétrage ; vous pourrez modifier les noms d’affichage ensuite.

Créer les colonnes avec les noms techniques ci-dessous. La colonne `Title` existe déjà : elle s’affiche généralement sous le nom **Titre**.

### SessionsSatisfaction — une ligne par session

| Colonne              | Type SharePoint                     | Valeur reçue dans le flux     |
| -------------------- | ----------------------------------- | ----------------------------- |
| Title (Titre)        | Une ligne de texte                  | `sessionName`                 |
| SessionId            | Une ligne de texte, valeurs uniques | `sessionId`                   |
| SessionDate          | Date et heure, date uniquement      | `sessionDate`                 |
| Trainer              | Une ligne de texte                  | `trainer`                     |
| SessionStatus        | Une ligne de texte                  | `sessionStatus`               |
| ParticipantCount     | Nombre, 0 décimale                  | `sessionParticipantCount`     |
| ResponseCount        | Nombre, 0 décimale                  | `sessionResponseCount`        |
| AverageScore         | Nombre, 2 décimales, facultatif     | `sessionAverageScore`         |
| SatisfactionPercent  | Nombre, 2 décimales, facultatif     | `sessionSatisfactionPercent`  |
| ParticipationPercent | Nombre, 2 décimales                 | `sessionParticipationPercent` |
| SessionVersion       | Nombre, 0 décimale                  | `sessionVersion`              |
| MetricsUpdatedAt     | Date et heure                       | `metricsUpdatedAt`            |

Pour `SessionId`, activer **Appliquer des valeurs uniques** dans les paramètres de colonne. SharePoint indexe cette colonne ; vérifier l’index dans les paramètres de la liste. Pour les colonnes `…Percent`, utiliser un **nombre ordinaire de 0 à 100**, sans activer « Afficher en pourcentage » : l’API envoie déjà 87,5 pour 87,5 %.

### ReponsesSatisfaction — une ligne par participant ayant répondu

| Colonne           | Type SharePoint                          | Valeur reçue dans le flux                      |
| ----------------- | ---------------------------------------- | ---------------------------------------------- |
| Title (Titre)     | Une ligne de texte                       | `sessionName`                                  |
| EventId           | Une ligne de texte, valeurs uniques      | `eventId`                                      |
| Session           | Recherche → SessionsSatisfaction → Titre | ID SharePoint de la session trouvée/créée      |
| SessionId         | Une ligne de texte, indexée              | `sessionId`                                    |
| SessionDate       | Date et heure, date uniquement           | `sessionDate`                                  |
| ParticipantId     | Une ligne de texte                       | `participantId`                                |
| Prenom            | Une ligne de texte                       | `prenom`                                       |
| Nom               | Une ligne de texte                       | `nom`                                          |
| Email             | Une ligne de texte                       | `email`                                        |
| SubmittedAt       | Date et heure                            | `submittedAt`                                  |
| FinalScore        | Nombre, 2 décimales, facultatif          | `participantScore`                             |
| FinalScorePercent | Nombre, 2 décimales, facultatif          | `participantScorePercent`                      |
| Answers           | Plusieurs lignes de texte, texte brut    | `answersText`                                  |
| AnswersJson       | Plusieurs lignes de texte, texte brut    | Expression `string(triggerBody()?['answers'])` |

La colonne **Session** est une vraie colonne de recherche vers `SessionsSatisfaction`. Dans l’action Power Automate « Créer un élément », renseigner **Session Id** avec l’ID numérique SharePoint ; `SessionId` reste l’identifiant métier, par exemple DORA-2026-001. Conserver le nom technique `EventId`, activer ses valeurs uniques et indexer `SessionId` pour les recherches.

Chaque réponse contient les notes et les commentaires. `Answers` est lisible ; `AnswersJson` permet de réutiliser chaque réponse dans Power BI. Les champs numériques facultatifs restent vides si le questionnaire ne contient aucune note. Ne pas remplacer ces valeurs par zéro.

Créer une vue de `ReponsesSatisfaction` groupée par **Session**, avec Prénom, Nom, FinalScore, FinalScorePercent et SubmittedAt. La liste `SessionsSatisfaction` contient les taux et la moyenne actuels : ils ne sont pas répétés comme des valeurs devenues anciennes sur chaque participant.

## 2. Créer le flux de réception

Dans https://make.powerautomate.com, sélectionner l’environnement de votre organisation, puis créer un flux cloud vide. Ajouter le déclencheur **Lors de la réception d’une requête HTTP** / **When an HTTP request is received**, dans le connecteur **Request / Requête**. Si l’assistant impose un déclencheur initial, utiliser **Ignorer** pour ouvrir le concepteur vide. La disponibilité et la licence nécessaires sont indiquées dans votre environnement Microsoft.

1. Méthode : **POST**.
2. Coller le contenu intégral de [schema-declencheur.json](schema-declencheur.json) dans **Schéma JSON du corps de la demande**. On peut aussi le télécharger dans l’application, **Intégrations → Schéma du déclencheur HTTP**. Utiliser ce schéma plutôt qu’un schéma déduit d’un seul exemple : certains événements ne contiennent que les statistiques de session, et les moyennes peuvent être nulles.
3. L’intégration actuelle utilise l’URL signée du déclencheur et un secret d’en-tête. Pour ce mode, choisir **Anyone / Tout le monde** dans « Qui peut déclencher le flux ? » et ajouter la vérification de secret ci-dessous avant toute écriture. Si cette option est interdite par la politique de votre tenant, conserver cette politique : une authentification Entra par application devra être configurée avant d’activer l’envoi. Le backend actuel n’émet pas de jeton OAuth Entra.
4. Dans les paramètres du déclencheur, activer **Contrôle de simultanéité**, degré **1**. Cela évite que deux exécutions lisent puis modifient simultanément une même synthèse. Ce paramètre a des effets sur la mise en file du flux : ne l’activer que sur ce flux dédié.
5. Ajouter les actions ci-dessous avant d’enregistrer définitivement. Copier ensuite **l’URL HTTP POST complète générée par Power Automate**, y compris sa signature et ses paramètres. Ne pas reconstituer une URL depuis le nom du flux.

### Vérifier le secret avant toute écriture

Un secret dédié a été créé localement dans `.env.local`, variable `POWER_AUTOMATE_WEBHOOK_SECRET`. Copier cette valeur dans le contrôle du flux (ou une source de secrets déjà utilisée par votre organisation). Ne pas utiliser le mot de passe PostgreSQL.

Ajouter une **Condition** qui compare :

```text
triggerOutputs()?['headers']?['x-webhook-secret']
```

à la valeur attendue du secret. Dans la branche fausse : action **Réponse**, code **401**, corps `{"received":false}`, puis arrêter cette branche. Dans la branche vraie, poursuivre le traitement.

Activer les entrées/sorties sécurisées des étapes qui contiennent le secret, lorsqu’elles sont disponibles, pour ne pas l’afficher dans l’historique d’exécution. Réserver la modification du flux à ses administrateurs.

## 3. Actions SharePoint du flux

Initialiser une variable **entière** `SessionItemId` à `0` au niveau principal du flux, avant les conditions. Dans la branche où le secret est correct, ajouter une **Étendue** nommée `Traitement_SharePoint`. Toutes les actions d’écriture suivantes appartiennent à cette étendue. Dans chaque action SharePoint, choisir le site cible indiqué au début de ce guide et votre connexion Microsoft 365.

### A. Trouver ou mettre à jour la session

1. **Obtenir les éléments**, liste `SessionsSatisfaction`, renommer l’action `Chercher_session`.
2. **Requête de filtre** :

   ```text
   SessionId eq '@{triggerBody()?['sessionId']}'
   ```

   **Nombre maximal d’éléments** : `1`. Les identifiants de session de l’application ne contiennent pas d’apostrophe.

3. Condition avec l’expression :

   ```text
   empty(body('Chercher_session')?['value'])
   ```

4. Si vrai : **Créer un élément** dans `SessionsSatisfaction`, remplir les colonnes avec le tableau ci-dessus. Puis **Définir la variable** `SessionItemId` avec l’**ID** retourné par cette création.
5. Si faux : définir `SessionItemId` avec :

   ```text
   first(body('Chercher_session')?['value'])?['ID']
   ```

   Ajouter une condition de version :

   ```text
   greaterOrEquals(
     int(triggerBody()?['sessionVersion']),
     int(coalesce(first(body('Chercher_session')?['value'])?['SessionVersion'], -1))
   )
   ```

   Si vrai, **Mettre à jour un élément**, ID `variables('SessionItemId')`, en renseignant les mêmes colonnes que pour la création. Si faux, conserver la synthèse existante : la requête reçue est plus ancienne.

### B. Enregistrer la réponse du participant

Après la condition de la session, ajouter une condition :

```text
equals(triggerBody()?['eventType'], 'satisfaction.response')
```

Dans la branche vraie :

1. **Obtenir les éléments** de `ReponsesSatisfaction`, renommer `Chercher_reponse` ; filtre :

   ```text
   EventId eq '@{triggerBody()?['eventId']}'
   ```

   Nombre maximal `1`.

2. Si `empty(body('Chercher_reponse')?['value'])` est vrai : **Créer un élément**, avec les valeurs du tableau. Pour le champ **Session Id** de la recherche SharePoint, choisir `variables('SessionItemId')`.
3. Sinon : la réponse a déjà été enregistrée ; ne pas créer de doublon. La mise à jour de synthèse de la partie A a quand même été vérifiée.

Pour `satisfaction.session`, aucune ligne participant n’est créée : seul le nombre de participants, le taux ou les métadonnées de session changent. L’application émet cet événement lorsqu’un nouvel import ou une modification intervient après les premières réponses.

### C. Confirmer la fin du traitement

Après `Traitement_SharePoint`, ajouter **Réponse**, à exécuter uniquement si l’étendue **a réussi** :

- Code : `200`.
- En-tête : `Content-Type` = `application/json`.
- Corps :

```json
{
  "received": true,
  "eventId": "@{triggerBody()?['eventId']}"
}
```

Ajouter une autre **Réponse** configurée via **Exécuter après** si l’étendue **a échoué** ou **a expiré** : code `503`, corps `{"received":false}`. La réponse 200 doit se trouver après les enregistrements SharePoint. Le simple 202 automatique d’un déclencheur ne confirme pas l’écriture ; l’application exige l’accusé de réception ci-dessus.

## 4. Renseigner l’URL dans l’application et tester

Dans `.env.local`, remplacer uniquement la ligne suivante par l’URL complète générée, entre guillemets :

```dotenv
POWER_AUTOMATE_WEBHOOK_URL="URL_HTTP_POST_COMPLETE_DU_FLUX"
```

Conserver `POWER_AUTOMATE_WEBHOOK_SECRET`. Redémarrer `npm run dev` après cette modification. En production, ajouter les mêmes variables dans l’environnement Vercel puis redéployer. Une URL locale n’est pas appelée par Power Automate : ici, c’est l’application qui appelle le flux cloud ; l’envoi peut donc être testé depuis le poste de développement.

```powershell
npm run powerautomate:config
npm run powerautomate:test
```

La seconde commande **envoie un test réel** avec les données fictives du fichier [exemple-reponse.json](exemple-reponse.json). Elle doit créer une session `TEST-HOT-2026` et une réponse `TEST Dupont` dans SharePoint. La relancer doit conserver **une seule** réponse grâce à `EventId`. Les tests réutilisent volontairement le même identifiant. Pour simuler un nouveau participant, modifier les identifiants du fichier de démonstration. Supprimer les lignes de test de SharePoint après validation si vous ne souhaitez pas les conserver.

Une fois le test validé, dans l’application : **Intégrations → Réessayer les 5 prochains envois** pour envoyer les réponses déjà enregistrées. Répéter si la file contient plus de cinq événements. Les événements historiques sont enrichis avec les informations et indicateurs actuels avant envoi ; aucune nouvelle réponse de participant n’est créée.

## Calculs et fonctionnement

- **Note finale participant** : moyenne de ses notes, normalisées sur 4 ; les champs Nombre, Oui/Non et texte n’entrent pas dans cette moyenne. Les anciens barèmes sur 5/10 sont convertis proportionnellement.
- **Satisfaction participant (%)** : moyenne non arrondie / 4 × 100.
- **Note moyenne session** : moyenne de toutes les notes de tous ses répondants, normalisées sur 4, comme le tableau de bord.
- **Satisfaction session (%)** : cette moyenne non arrondie / 4 × 100.
- **Participation session (%)** : nombre de réponses / nombre de participants × 100.
- Deux décimales pour les notes et pourcentages. Exemple : 3,5/4 = 87,5 % ; 2 réponses pour 5 participants = 40 % de participation.
- Les notes inexistantes sont `null`. La participation est 0 s’il n’y a aucun participant.
- Le numéro `sessionVersion` augmente lors d’une réponse, d’un import réel ou d’une modification de la session. Le flux ne remplace pas une synthèse par une version inférieure.
- La file PostgreSQL conserve les envois jusqu’à un HTTP 200 et un accusé valide. Timeout réseau 45 secondes ; verrou de livraison 120 secondes ; cinq envois maximum par reprise ; attente exponentielle de 1 minute à 24 heures. Le cron Vercel est quotidien par défaut : adapter sa fréquence au plan et au volume pour des reprises plus rapides.
- Les événements de session sont émis après les premières réponses ; aucune synthèse d’une session sans réponse n’est créée automatiquement. Supprimer une session dans l’application ne supprime pas les historiques SharePoint.
- `POST /api/webhook/powerautomate` est le récepteur **entrant** de l’application et utilise un autre secret. Pour cette intégration sortante, l’URL attendue est celle du déclencheur Power Automate.

## Références Microsoft

- [Authentification du déclencheur HTTP](https://learn.microsoft.com/power-automate/oauth-authentication).
- [Connecteur SharePoint : Obtenir les éléments, Créer et Mettre à jour](https://learn.microsoft.com/connectors/sharepoint/).
- [Relations entre listes et colonnes de recherche](https://support.microsoft.com/fr-fr/sharepoint/lists/data-and-lists/create-list-relationships-by-using-lookup-columns).
- [Limites et contrôle de simultanéité](https://learn.microsoft.com/power-automate/limits-and-config).
- [Entrées et sorties sécurisées](https://learn.microsoft.com/power-automate/guidance/coding-guidelines/use-secure-inputs-outputs-triggers).
