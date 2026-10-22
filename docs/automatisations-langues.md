# Suivi des automatisations et questionnaire multilingue

## Suivi

Dans le menu **Automatisations**, consulter la dernière exécution enregistrée, la prochaine échéance prévue, les 20 derniers passages et leurs étapes. Le panneau se rafraîchit toutes les 30 secondes ; **Actualiser** ne déclenche aucun envoi ni suppression.

Le calendrier Vercel existant est quotidien à **06:00 UTC**. L’heure affichée est celle de Luxembourg. En local, aucun ordonnanceur n’est installé : une tâche externe doit appeler `GET /api/cron/webhooks` avec `Authorization: Bearer CRON_SECRET`. La présence de ce secret ne prouve pas que l’ordonnanceur est installé. Le suivi commence à l’installation de cette version et n’invente pas d’historique antérieur.

Les exécutions sont **en cours**, **terminées**, **terminées avec erreurs**, **en échec**, ou **interrompues / délai dépassé**. Une exécution encore ouverte après huit minutes est signalée comme interrompue. Les appels simultanés sont dédupliqués sous verrou PostgreSQL ; un second appel reçoit HTTP 202 sans lancer de nouvelle tâche. Une étape en erreur laisse les autres étapes se poursuivre. Une erreur d’étape donne HTTP 503 au flux appelant.

Le retard quotidien est signalé deux heures après l’échéance si la dernière exécution enregistrée la précède. En l’absence d’historique, le panneau indique explicitement qu’aucun passage n’a été enregistré. Une exécution terminée signifie que le traitement a eu lieu ; les compteurs e-mail, Odoo et Power Automate donnent les résultats de livraison. Les envois immédiats restent suivis dans chaque session. Aucun renvoi manuel de tâche générale n’est ajouté ici.

API administrateur : `GET /api/automations`. Les résumés du journal ne contiennent ni secrets, ni URL personnelles, ni contenus de réponses. La table `AutomationRun` est protégée par RLS et inaccessible aux rôles Supabase publics.

## Langues

Dans **Créer / Modifier une session → Langue initiale du questionnaire**, choisir **Français** (par défaut), **Allemand**, **Anglais** ou **Automatique — langue du navigateur**. Les sessions existantes restent en français.

En mode automatique, la préférence principale du navigateur (`Accept-Language`, pondérée par les priorités `q`) sélectionne le français, l’allemand ou l’anglais. Toute autre préférence principale (espagnol, portugais, etc.) ou absence de préférence ouvre l’anglais, même si une langue française secondaire est indiquée. Les variantes régionales sont reconnues (`fr-LU`, `de-CH`, `en-GB`, etc.). Le calcul se fait côté serveur dès le premier affichage, y compris pour un lien déjà utilisé ou une session fermée.

Le choix explicite `?lang=fr|de|en` effectué par le participant reste prioritaire sur le réglage de la session et sur le navigateur. Il peut donc choisir sa langue et la conserver en rechargeant la page. La détection ne crée aucun cookie ni profil supplémentaire. Le même réglage est appliqué à l’aperçu administrateur.

Le participant peut choisir **Français**, **Deutsch** ou **English** en haut de son questionnaire. Le changement de langue conserve les notes, choix et commentaires déjà saisis. La langue figure dans `?lang=fr|de|en` et est conservée si la page est rechargée ; les réponses non envoyées ne sont pas sauvegardées lors d’un rechargement. La langue ne modifie pas le token : la soumission reste unique dans toutes les langues.

Les douze questions standard House of Training possèdent des traductions allemandes et anglaises intégrées. La fiche de formation, les contrôles, les commentaires, les informations d’utilisation, la confirmation et les écrans de lien fermé ou consommé sont traduits. Les noms des personnes et formations restent ceux de la session. L’administration et les e-mails restent en français.

Dans **Modifier la session → Questionnaire → Traductions du questionnaire**, compléter les traductions des questions personnalisées. Les choix doivent être traduits dans le même ordre et en même nombre que les valeurs françaises. Sans traduction, le texte français est affiché avec une information au participant. Les traductions restent modifiables après import ; le texte français, le type et les valeurs des choix restent verrouillés.

Les identifiants de questions, valeurs soumises, notes et libellés canoniques pour Odoo restent identiques. Les commentaires sont conservés dans la langue saisie ; ils ne sont pas traduits automatiquement. La langue choisie est enregistrée avec la réponse (`Response.language`). Les anciennes réponses sont marquées `fr` pour compatibilité.

API : `QuestionInput.translations` accepte `de` et `en`, chacun avec `label` et, pour les choix, `options`. `POST /api/submit` accepte `language: "fr" | "de" | "en"`, facultatif avec français par défaut.
