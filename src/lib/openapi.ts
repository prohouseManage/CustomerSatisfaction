import { questionTypes } from './validation';
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const content = (schema: object) => ({ 'application/json': { schema } });
const ok = (schema: object = { type: 'object' }) => ({
  description: 'Succès',
  content: content(schema),
});
const errors = {
  400: { description: 'Validation échouée', content: content(ref('Error')) },
  401: { description: 'Authentification requise' },
  403: { description: 'Origine ou accès refusé' },
  404: { description: 'Ressource introuvable' },
  409: { description: 'Conflit ou questionnaire déjà complété' },
  429: { description: 'Limite atteinte ; Retry-After en secondes' },
  503: { description: 'Service indisponible' },
};
const sessionQuery = {
  name: 'sessionId',
  in: 'query',
  schema: { type: 'string' },
  description: 'Filtre par identifiant de session',
};
const reportDates = ['dateFrom', 'dateTo'].map((name) => ({
  name,
  in: 'query',
  schema: { type: 'string', format: 'date' },
  description: `${name === 'dateFrom' ? 'Début' : 'Fin'} inclusif de la période de formation. Inclut les sessions dont les dates croisent cette période ; ne filtre pas la date de soumission. dateFrom <= dateTo. Pour un jour précis, fournir la même valeur aux deux bornes.`,
}));
const pageQuery = {
  name: 'page',
  in: 'query',
  schema: { type: 'integer', minimum: 1, default: 1 },
  description: '100 éléments par page',
};
const pathId = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const origin = {
  name: 'Origin',
  in: 'header',
  required: true,
  schema: { type: 'string', format: 'uri' },
  description:
    'Doit correspondre exactement à NEXTAUTH_URL pour toute mutation depuis le navigateur.',
};
const body = (schema: object) => ({ required: true, content: content(schema) });
const adminSecurity = [{ adminSession: [] }];
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'House of Training · API Satisfaction',
    version: '1.0.0',
    description:
      'API serveur. Les opérations administrateur requièrent une session NextAuth avec compte existant. Les mutations requièrent Origin, sauf les webhooks qui utilisent un secret dédié. Les tokens participants ne sont jamais renvoyés dans les listes. Supabase REST ne doit pas exposer les tables.',
  },
  servers: [{ url: '/', description: 'Serveur courant' }],
  tags: [
    { name: 'Sessions' },
    { name: 'Participants' },
    { name: 'Réponses' },
    { name: 'Rapports' },
    { name: 'Modèles PDF' },
    { name: 'Intégrations' },
  ],
  paths: {
    '/api/automations': {
      get: {
        tags: ['Intégrations'],
        summary: 'Suivre les automatisations sans déclencher de traitement',
        description:
          'Administrateur uniquement. Historique des 20 dernières exécutions, détail des étapes, échéance quotidienne 06:00 UTC, retard après deux heures de marge et compteurs des livraisons. Les messages immédiats sont suivis dans leurs sessions. Aucun secret ou URL Odoo n’est exposé.',
        security: adminSecurity,
        responses: {
          200: ok({
            type: 'object',
            properties: {
              runs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    status: {
                      type: 'string',
                      enum: ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMED_OUT'],
                    },
                    startedAt: { type: 'string', format: 'date-time' },
                    finishedAt: { type: 'string', format: 'date-time', nullable: true },
                    steps: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          status: { type: 'string' },
                          summary: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
              nextScheduledAt: { type: 'string', format: 'date-time' },
              overdue: { type: 'boolean' },
              scheduler: { type: 'object' },
              emails: { type: 'object' },
              odoo: { type: 'object' },
              powerAutomate: { type: 'object' },
            },
          }),
          ...errors,
        },
      },
    },
    '/api/settings/email': {
      get: {
        tags: ['E-mails'],
        summary: 'Calendrier global et état de configuration du service d’e-mail',
        security: adminSecurity,
        responses: { 200: ok(), ...errors },
      },
      put: {
        tags: ['E-mails'],
        summary: 'Modifier le calendrier par défaut (sans envoyer d’e-mail)',
        security: adminSecurity,
        parameters: [origin],
        requestBody: body({
          type: 'object',
          required: ['enabled', 'delayDays'],
          properties: {
            enabled: { type: 'boolean' },
            delayDays: { type: 'integer', minimum: 1, maximum: 365 },
          },
        }),
        responses: { 200: ok(), ...errors },
      },
    },
    '/api/sessions/{id}/emails': {
      put: {
        tags: ['E-mails'],
        summary: 'Conserver la suspension ou reprogrammer les e-mails non envoyés',
        description:
          'Session active obligatoire. Reprogramme les messages suspendus à partir de la date choisie ; ne soumet aucun e-mail immédiatement. Les réponses reçues et envois confirmés/incertains sont exclus.',
        security: adminSecurity,
        parameters: [pathId, origin],
        requestBody: body(ref('EmailReactivation')),
        responses: { 200: ok(), ...errors },
      },
      get: {
        tags: ['E-mails'],
        summary: 'Calendrier, compteurs et derniers envois de la session',
        security: adminSecurity,
        parameters: [pathId],
        responses: { 200: ok(), ...errors },
      },
      post: {
        tags: ['E-mails'],
        summary: 'Envoyer manuellement aux non-répondants ou à un participant précis',
        description:
          'Session active obligatoire. Les personnes ayant répondu, les envois en attente/en cours/incertains et les destinataires contactés depuis moins de cinq minutes sont exclus. Un participantId ne cible que la session demandée. Le traitement est différé après mise en file.',
        security: adminSecurity,
        parameters: [pathId, origin],
        requestBody: body({
          type: 'object',
          required: ['confirmation'],
          additionalProperties: false,
          properties: {
            confirmation: { type: 'string', enum: ['envoyer les invitations'] },
            participantId: { type: 'string', format: 'uuid' },
          },
        }),
        responses: { 202: ok(), ...errors },
      },
    },
    '/api/settings/retention': {
      get: {
        tags: ['Sessions'],
        summary: 'Lire la conservation des sessions archivées',
        security: adminSecurity,
        responses: {
          200: ok({
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              value: { type: 'integer' },
              unit: { type: 'string', enum: ['DAYS', 'MONTHS', 'YEARS'] },
              archivedCount: { type: 'integer' },
              dueCount: { type: 'integer' },
            },
          }),
          ...errors,
        },
      },
      put: {
        tags: ['Sessions'],
        summary: 'Configurer la suppression automatique après archivage',
        security: adminSecurity,
        parameters: [origin],
        description:
          'Désactivée par défaut, délai prérempli à deux mois. Le délai part de archivedAt. La règle s’applique aux sessions déjà archivées. La sauvegarde ne déclenche pas de suppression.',
        requestBody: body({
          type: 'object',
          required: ['enabled', 'value', 'unit'],
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean' },
            value: { type: 'integer', minimum: 1, maximum: 10000 },
            unit: { type: 'string', enum: ['DAYS', 'MONTHS', 'YEARS'] },
          },
        }),
        responses: { 200: ok(), ...errors },
      },
    },
    '/api/odoo/verify': {
      post: {
        tags: ['Intégrations'],
        summary: 'Vérifier un lien Odoo sans envoyer d’évaluation',
        security: adminSecurity,
        parameters: [origin],
        requestBody: body({
          oneOf: [
            {
              type: 'object',
              required: ['url'],
              properties: { url: { type: 'string', format: 'uri', maxLength: 2048 } },
            },
            {
              type: 'object',
              required: ['sessionId'],
              properties: { sessionId: { type: 'string' } },
            },
          ],
        }),
        responses: {
          200: ok({
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              sessionName: { type: 'string' },
              trainer: { type: 'string' },
              sessionId: {
                type: 'string',
                nullable: true,
                description:
                  'Identifiant numérique explicitement exposé par la page Odoo ; null si absent ou ambigu. Jamais déduit du UUID du lien ni des numéros de questions.',
              },
              environment: { type: 'string' },
              questionCount: { type: 'integer' },
              message: { type: 'string' },
            },
          }),
          ...errors,
        },
      },
    },
    '/api/sessions/{id}/odoo': {
      get: {
        tags: ['Intégrations'],
        summary: 'Consulter les envois Odoo de cette session',
        security: adminSecurity,
        parameters: [
          pathId,
          {
            name: 'includeUrl',
            in: 'query',
            schema: { type: 'boolean', default: false },
            description:
              'Réservé à l’éditeur administrateur : inclut le lien enregistré pour modification.',
          },
        ],
        responses: {
          200: ok({
            type: 'object',
            properties: {
              configured: { type: 'boolean' },
              targetSessionId: { type: 'string', nullable: true },
              environment: { type: 'string', nullable: true },
              url: {
                type: 'string',
                description: 'Uniquement avec includeUrl=true, pour l’administrateur connecté.',
              },
              enabled: { type: 'boolean', description: 'Uniquement avec includeUrl=true.' },
              sent: { type: 'integer' },
              pending: { type: 'integer' },
              failed: { type: 'integer' },
              uncertain: { type: 'integer' },
              lastError: { type: 'string', nullable: true },
            },
          }),
          ...errors,
        },
      },
      post: {
        tags: ['Intégrations'],
        summary: 'Mettre les réponses de cette session dans la file Odoo',
        security: adminSecurity,
        description:
          'Lien Odoo actif enregistré dans cette session. Traite deux envois par appel après la réponse HTTP. Les réponses déjà confirmées et les envois incertains ne sont jamais réémis. Une remise en file explicite peut utiliser le nouveau lien pour les échecs survenus avant POST.',
        parameters: [pathId, origin],
        responses: { 202: ok(), ...errors },
      },
    },
    '/api/sessions/{id}/pdf-template': {
      put: {
        tags: ['Sessions'],
        summary: 'Enregistrer le modèle PDF de cette session',
        description:
          'Ce choix reste mémorisé pour les exports suivants. Sans effet sur les participants et leurs liens.',
        security: adminSecurity,
        parameters: [pathId, origin],
        requestBody: body({
          type: 'object',
          required: ['templateId'],
          additionalProperties: false,
          properties: {
            templateId: {
              type: 'string',
              maxLength: 100,
              description: 'hot-classic, hot-banner ou identifiant d’un modèle personnalisé.',
            },
          },
        }),
        responses: { 200: ok(ref('Session')), ...errors },
      },
    },
    '/api/pdf-templates': {
      get: {
        tags: ['Modèles PDF'],
        summary: 'Lister les modèles intégrés et personnalisés',
        security: adminSecurity,
        responses: { 200: ok({ type: 'array', items: ref('PdfTemplate') }), ...errors },
      },
      post: {
        tags: ['Modèles PDF'],
        summary: 'Créer un modèle réutilisable',
        security: adminSecurity,
        parameters: [origin],
        requestBody: body(ref('PdfTemplateInput')),
        responses: { 201: ok(ref('PdfTemplate')), ...errors },
      },
    },
    '/api/pdf-templates/{id}': {
      put: {
        tags: ['Modèles PDF'],
        summary: 'Modifier un modèle personnalisé (corps complet)',
        security: adminSecurity,
        parameters: [pathId, origin],
        requestBody: body(ref('PdfTemplateInput')),
        responses: { 200: ok(ref('PdfTemplate')), ...errors },
      },
      delete: {
        tags: ['Modèles PDF'],
        summary: 'Supprimer un modèle personnalisé',
        security: adminSecurity,
        parameters: [pathId, origin],
        responses: {
          204: { description: 'Modèle supprimé. Les PDF et liens existants sont conservés.' },
          ...errors,
          409: {
            description:
              'Le modèle est utilisé par une session. Choisir un autre modèle pour cette session avant suppression.',
          },
        },
      },
    },
    '/api/pdf-templates/preview': {
      post: {
        tags: ['Modèles PDF'],
        summary: 'Prévisualiser une page avec un QR code de démonstration',
        security: adminSecurity,
        parameters: [origin],
        requestBody: body({
          type: 'object',
          required: ['template'],
          additionalProperties: false,
          properties: {
            template: ref('PdfTemplateInput'),
            sessionId: { type: 'string', maxLength: 100 },
          },
        }),
        responses: {
          200: {
            description: 'Une page A4 sans token participant réel',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          ...errors,
        },
      },
    },
    '/api/sessions': {
      get: {
        tags: ['Sessions'],
        summary: 'Lister les sessions et leurs questions',
        security: adminSecurity,
        responses: { 200: ok({ type: 'array', items: ref('Session') }), ...errors },
      },
      post: {
        tags: ['Sessions'],
        summary: 'Créer une session',
        security: adminSecurity,
        parameters: [origin],
        requestBody: body(ref('SessionInput')),
        responses: { 201: ok(ref('Session')), ...errors },
      },
    },
    '/api/sessions/{id}': {
      get: {
        tags: ['Sessions'],
        summary: 'Consulter une session',
        security: adminSecurity,
        parameters: [pathId],
        responses: { 200: ok(ref('Session')), ...errors },
      },
      patch: {
        tags: ['Sessions'],
        summary: 'Modifier ou archiver une session',
        description:
          'Corps complet requis. Identifiant immuable. Questions verrouillées dès le premier import de participants.',
        security: adminSecurity,
        parameters: [pathId, origin],
        requestBody: body(ref('SessionInput')),
        responses: { 200: ok(ref('Session')), ...errors },
      },
      delete: {
        tags: ['Sessions'],
        summary: 'Supprimer une session archivée et ses données',
        security: adminSecurity,
        parameters: [pathId, origin],
        requestBody: body({
          type: 'object',
          required: ['confirmation'],
          additionalProperties: false,
          properties: { confirmation: { type: 'string', enum: ['supprimer la session'] } },
        }),
        responses: { 204: { description: 'Suppression définitive' }, ...errors },
      },
    },
    '/api/sessions/import-participants': {
      post: {
        tags: ['Participants'],
        summary: 'Importer un fichier Excel',
        description:
          'Colonnes Nom, Prénom, Email ; première feuille, .xlsx ≤ 2 Mo, 1 à 1 000 lignes par import. E-mails normalisés et uniques par session. Les participants existants sont ignorés. Import atomique.',
        security: adminSecurity,
        parameters: [origin],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['sessionId', 'file'],
                properties: {
                  sessionId: { type: 'string' },
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: ok({
            type: 'object',
            properties: { imported: { type: 'integer' }, skipped: { type: 'integer' } },
          }),
          413: { description: 'Fichier trop volumineux' },
          ...errors,
        },
      },
    },
    '/api/participants': {
      get: {
        tags: ['Participants'],
        summary: 'Lister les participants sans token',
        security: adminSecurity,
        parameters: [sessionQuery, pageQuery],
        responses: {
          200: ok({
            type: 'object',
            properties: {
              items: { type: 'array', items: ref('Participant') },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
            },
          }),
          ...errors,
        },
      },
    },
    '/api/participants/{id}/emails': {
      get: {
        tags: ['Participants'],
        summary: 'Historique des e-mails d’un participant',
        description:
          'Dates, type et statut des tentatives, de la plus récente à la plus ancienne. SENT signifie accepté par Mailgun, sans preuve de réception ni de lecture. Aucun token participant ou identifiant SMTP.',
        security: adminSecurity,
        parameters: [pathId, { ...pageQuery, description: '20 éléments par page' }],
        responses: {
          200: ok({
            type: 'object',
            properties: {
              participant: ref('Participant'),
              items: { type: 'array', items: ref('EmailHistoryItem') },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
            },
          }),
          ...errors,
        },
      },
    },
    '/api/participants/{id}/link': {
      get: {
        tags: ['Participants'],
        summary: 'Lire le lien et le QR Code d’un participant en attente',
        security: adminSecurity,
        parameters: [pathId],
        responses: {
          200: ok({
            type: 'object',
            properties: {
              link: { type: 'string', format: 'uri' },
              qrCode: { type: 'string', description: 'PNG en data URL' },
            },
          }),
          410: { description: 'Participant ayant déjà répondu' },
          ...errors,
        },
      },
    },
    '/api/sessions/{id}/export': {
      get: {
        tags: ['Participants'],
        summary: 'Exporter les liens Excel ou une invitation PDF par participant',
        description:
          'PDF unique : une page A4 par participant, logo House of Training, formation, destinataire et QR code personnel cliquable. Les liens déjà consommés restent inactifs. Aucun participant : erreur 400 en PDF.',
        security: adminSecurity,
        parameters: [
          pathId,
          {
            name: 'format',
            in: 'query',
            schema: { type: 'string', enum: ['xlsx', 'pdf'], default: 'xlsx' },
          },
          {
            name: 'templateId',
            in: 'query',
            description:
              'PDF uniquement : remplacement ponctuel du modèle enregistré pour la session. Sans ce paramètre, utilise le choix mémorisé dans la session.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Fichier',
            content: {
              'application/pdf': { schema: { type: 'string', format: 'binary' } },
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          ...errors,
        },
      },
    },
    '/api/template': {
      get: {
        tags: ['Participants'],
        summary: 'Modèle Excel des participants',
        security: adminSecurity,
        responses: { 200: { description: 'Classeur Excel .xlsx' }, ...errors },
      },
    },
    '/api/responses': {
      get: {
        tags: ['Réponses'],
        summary: 'Lister les réponses',
        security: adminSecurity,
        parameters: [sessionQuery, ...reportDates, pageQuery],
        responses: {
          200: ok({
            type: 'object',
            properties: {
              items: { type: 'array', items: ref('Response') },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
            },
          }),
          ...errors,
        },
      },
    },
    '/api/submit': {
      post: {
        tags: ['Réponses'],
        summary: 'Soumettre une seule fois le questionnaire',
        description:
          'Accès par token de 256 bits. Validation stricte contre les questions de la session. Transaction PostgreSQL avec verrou de session, consommation atomique du token et réponse unique par participant. Une nouvelle tentative après succès renvoie 409.',
        parameters: [origin],
        requestBody: body({
          type: 'object',
          required: ['sessionId', 'token', 'answers'],
          additionalProperties: false,
          properties: {
            sessionId: { type: 'string' },
            token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
            answers: { type: 'array', maxItems: 50, items: ref('Answer') },
            language: {
              type: 'string',
              enum: ['fr', 'de', 'en'],
              default: 'fr',
              description:
                'Langue affichée au participant. Les réponses restent associées aux mêmes identifiants et valeurs canoniques.',
            },
          },
        }),
        responses: {
          201: ok({
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' }, message: { type: 'string' } },
          }),
          410: { description: 'Session fermée' },
          ...errors,
        },
      },
    },
    '/api/statistics': {
      get: {
        tags: ['Rapports'],
        summary: 'Statistiques et résultats par question',
        security: adminSecurity,
        parameters: [sessionQuery, ...reportDates],
        responses: { 200: ok(ref('Statistics')), ...errors },
      },
    },
    '/api/exports': {
      get: {
        tags: ['Rapports'],
        summary: 'Exporter les rapports Excel ou PDF',
        security: adminSecurity,
        parameters: [
          sessionQuery,
          ...reportDates,
          {
            name: 'format',
            in: 'query',
            schema: { type: 'string', enum: ['xlsx', 'pdf'], default: 'xlsx' },
          },
        ],
        responses: {
          200: {
            description: 'Fichier de rapport ; Excel contient aussi les réponses nominatives',
          },
          ...errors,
        },
      },
    },
    '/api/integrations': {
      get: {
        tags: ['Intégrations'],
        summary: 'Configuration (sans secrets) et état de la file',
        security: adminSecurity,
        responses: { 200: ok(), ...errors },
      },
      post: {
        tags: ['Intégrations'],
        summary: 'Réessayer les envois en attente (5 maximum par appel)',
        security: adminSecurity,
        parameters: [origin],
        responses: { 200: ok(), ...errors },
      },
    },
    '/api/integrations/powerautomate': {
      get: {
        tags: ['Intégrations'],
        summary: 'Télécharger le schéma du déclencheur HTTP ou un exemple fictif',
        security: adminSecurity,
        parameters: [
          {
            name: 'format',
            in: 'query',
            schema: { type: 'string', enum: ['schema', 'example'], default: 'schema' },
          },
        ],
        responses: {
          200: {
            description: 'Fichier JSON à utiliser dans Power Automate ; aucun token réel.',
            content: content({ type: 'object' }),
          },
          ...errors,
        },
      },
    },
    '/api/webhook/powerautomate': {
      post: {
        tags: ['Intégrations'],
        summary: 'Recevoir un événement depuis Power Automate',
        description:
          'Réception et déduplication par eventId. Ne soumet pas un questionnaire et ne redéclenche pas l’envoi sortant. Secret POWER_AUTOMATE_INBOUND_SECRET requis.',
        security: [{ webhookSecret: [] }],
        requestBody: body(ref('WebhookEvent')),
        responses: {
          200: ok({
            type: 'object',
            properties: {
              received: { type: 'boolean' },
              eventId: { type: 'string', format: 'uuid' },
            },
          }),
          ...errors,
        },
      },
    },
    '/api/cron/webhooks': {
      get: {
        tags: ['Intégrations'],
        summary: 'Reprise des envois sortants en attente',
        description:
          'CRON_SECRET obligatoire. Traitement des sessions à supprimer, invitations automatiques et livraisons en attente. Chaque exécution et ses étapes sont journalisées sans secrets. Un appel concurrent ne relance pas une exécution active ; une exécution abandonnée est signalée après huit minutes. Les erreurs d’une étape laissent les autres étapes se poursuivre. Une étape terminée ne garantit pas toutes les livraisons : consulter les compteurs.',
        security: [{ cronBearer: [] }],
        responses: {
          200: ok(),
          202: { description: 'Une exécution est déjà en cours.' },
          ...errors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      adminSession: {
        type: 'apiKey',
        in: 'cookie',
        name: '__Secure-next-auth.session-token',
        description:
          'Cookie NextAuth ; next-auth.session-token en développement HTTP. Connexion via /login et CSRF NextAuth.',
      },
      webhookSecret: { type: 'apiKey', in: 'header', name: 'x-webhook-secret' },
      cronBearer: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      OutgoingWebhookEvent: {
        type: 'object',
        description:
          'Payload envoyé à l’URL du déclencheur Power Automate. Les champs participant et answers ne sont présents que pour satisfaction.response. Les scores absents sont null. Refuser les versions de session inférieures à celles déjà enregistrées.',
        required: [
          'schemaVersion',
          'eventType',
          'eventId',
          'sessionId',
          'sessionName',
          'sessionDate',
          'sessionVersion',
          'sessionParticipantCount',
          'sessionResponseCount',
          'sessionParticipationPercent',
          'sessionAverageScore',
          'sessionSatisfactionPercent',
          'scoreScale',
        ],
        properties: {
          schemaVersion: { type: 'integer', enum: [2] },
          eventType: { type: 'string', enum: ['satisfaction.response', 'satisfaction.session'] },
          eventId: { type: 'string', format: 'uuid' },
          sessionId: { type: 'string' },
          sessionName: { type: 'string' },
          sessionDate: { type: 'string', format: 'date' },
          trainer: { type: 'string' },
          sessionStatus: { type: 'string' },
          sessionVersion: { type: 'integer' },
          metricsUpdatedAt: { type: 'string', format: 'date-time' },
          sessionParticipantCount: { type: 'integer' },
          sessionResponseCount: { type: 'integer' },
          sessionParticipationPercent: { type: 'number', minimum: 0, maximum: 100 },
          sessionAverageScore: { type: 'number', nullable: true, minimum: 0, maximum: 4 },
          sessionSatisfactionPercent: { type: 'number', nullable: true, minimum: 0, maximum: 100 },
          sessionRatingCount: { type: 'integer' },
          scoreScale: { type: 'integer', enum: [4] },
          participantId: { type: 'string', format: 'uuid' },
          nom: { type: 'string' },
          prenom: { type: 'string' },
          email: { type: 'string', format: 'email' },
          submittedAt: { type: 'string', format: 'date-time' },
          participantScore: { type: 'number', nullable: true },
          participantScorePercent: { type: 'number', nullable: true },
          participantRatingCount: { type: 'integer' },
          answersText: { type: 'string' },
          answers: {
            type: 'array',
            items: {
              allOf: [
                ref('Answer'),
                {
                  type: 'object',
                  properties: { label: { type: 'string' }, type: { type: 'string' } },
                },
              ],
            },
          },
        },
      },
      PdfTemplateInput: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'heading',
          'introduction',
          'organizationText',
          'footer',
          'accentColor',
          'layout',
          'showEmail',
          'showDescription',
        ],
        description:
          'Texte simple. Variables autorisées : {{formation}}, {{date}}, {{formateur}}, {{sessionId}}, {{prenom}}, {{nom}}, {{email}}. Textes trop longs pour une page : erreur 400 à la génération.',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          heading: { type: 'string', minLength: 1, maxLength: 100 },
          introduction: { type: 'string', maxLength: 600 },
          organizationText: { type: 'string', maxLength: 280 },
          footer: { type: 'string', maxLength: 180 },
          accentColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          layout: { type: 'string', enum: ['CLASSIC', 'BANNER'] },
          showEmail: { type: 'boolean' },
          showDescription: {
            type: 'boolean',
            description: 'Affiche un extrait de 220 caractères maximum.',
          },
        },
      },
      PdfTemplate: {
        allOf: [
          ref('PdfTemplateInput'),
          {
            type: 'object',
            properties: { id: { type: 'string' }, builtin: { type: 'boolean', readOnly: true } },
          },
        ],
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      EmailReactivation: {
        oneOf: [
          {
            type: 'object',
            required: ['action'],
            additionalProperties: false,
            properties: { action: { type: 'string', enum: ['KEEP_PAUSED'] } },
          },
          {
            type: 'object',
            required: ['action', 'date'],
            additionalProperties: false,
            properties: {
              action: { type: 'string', enum: ['RESCHEDULE'] },
              date: {
                type: 'string',
                format: 'date',
                description:
                  'Date locale Europe/Luxembourg, aujourd’hui ou plus tard. Le calendrier de la formation reste applicable.',
              },
            },
          },
        ],
      },
      QuestionInput: {
        type: 'object',
        required: ['label', 'type', 'required'],
        properties: {
          label: { type: 'string', minLength: 3, maxLength: 500 },
          type: { type: 'string', enum: questionTypes },
          required: { type: 'boolean' },
          translations: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(
              ['de', 'en'].map((lang) => [
                lang,
                {
                  type: 'object',
                  required: ['label'],
                  additionalProperties: false,
                  properties: {
                    label: { type: 'string', minLength: 3, maxLength: 500 },
                    options: {
                      type: 'array',
                      maxItems: 30,
                      items: { type: 'string', maxLength: 200 },
                      description:
                        'Chaque choix traduit dans le même ordre que les valeurs françaises. Les valeurs soumises restent en français.',
                    },
                  },
                },
              ]),
            ),
          },
          options: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', maxLength: 200 },
            description: 'Au moins 2 valeurs distinctes pour les choix et listes.',
          },
        },
      },
      Question: {
        allOf: [
          ref('QuestionInput'),
          {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              position: { type: 'integer' },
              sessionId: { type: 'string' },
            },
          },
        ],
      },
      SessionInput: {
        type: 'object',
        required: ['id', 'name', 'date', 'trainer', 'questions'],
        properties: {
          id: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9_-]{2,49}$' },
          name: { type: 'string', minLength: 3, maxLength: 200 },
          date: { type: 'string', format: 'date', description: 'Date de début de formation.' },
          endDate: {
            type: 'string',
            format: 'date',
            nullable: true,
            description:
              'Date de fin, égale ou postérieure au début. Création : omission ou null = même jour. Modification : omission conserve la fin existante ; null = même jour. Les invitations automatiques sont calculées à partir de la fin.',
          },
          formLanguage: {
            type: 'string',
            enum: ['fr', 'de', 'en', 'auto'],
            default: 'fr',
            description:
              'Langue initiale du questionnaire. auto utilise la préférence principale Accept-Language : fr/de/en ; autres langues ou préférence absente = anglais. Un choix explicite ?lang=fr|de|en du participant est prioritaire. Omission en modification : réglage conservé.',
          },
          trainer: { type: 'string', minLength: 2, maxLength: 150 },
          description: { type: 'string', maxLength: 3000 },
          status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT' },
          questions: { type: 'array', minItems: 1, maxItems: 50, items: ref('QuestionInput') },
          odooUrl: {
            type: 'string',
            maxLength: 2048,
            writeOnly: true,
            description:
              'Lien complet HTTPS du questionnaire Odoo de cette session, production ou préproduction. Chaîne vide pour retirer le lien ; omission pour le conserver en modification.',
          },
          odooEnabled: {
            type: 'boolean',
            writeOnly: true,
            description:
              'Active la transmission automatique après les soumissions. Aucun envoi lors de la simple sauvegarde du lien.',
          },
          emailSchedule: {
            type: 'object',
            nullable: true,
            description:
              'Calendrier d’invitation de cette session. Omission ou null en modification : conserver. Un seul envoi automatique par participant, globalement activé et uniquement pour les non-répondants. Les métadonnées suspended et resumeOn des réponses GET sont ignorées en écriture.',
            required: ['mode'],
            properties: {
              mode: { type: 'string', enum: ['INHERIT', 'CUSTOM', 'OFF'] },
              delayDays: {
                type: 'integer',
                nullable: true,
                minimum: 1,
                maximum: 365,
                description: 'Obligatoire pour CUSTOM ; 7 correspond à une semaine.',
              },
            },
          },
          emailReactivation: {
            ...ref('EmailReactivation'),
            description:
              'Choix obligatoire pour quitter le statut ARCHIVED : conserver la suspension ou choisir une date de reprise. Réservé aux modifications, pas aux créations.',
          },
        },
      },
      Session: {
        allOf: [
          ref('SessionInput'),
          {
            type: 'object',
            properties: {
              pdfPreset: { type: 'string', enum: ['hot-classic', 'hot-banner'], readOnly: true },
              archivedAt: {
                type: 'string',
                format: 'date-time',
                nullable: true,
                readOnly: true,
                description:
                  'Point de départ du délai de conservation. Remis à null à la réactivation.',
              },
              pdfTemplateId: {
                type: 'string',
                nullable: true,
                readOnly: true,
                description: 'Modèle personnalisé choisi ; sinon utilise pdfPreset.',
              },
              questions: { type: 'array', items: ref('Question') },
              _count: {
                type: 'object',
                properties: { participants: { type: 'integer' }, responses: { type: 'integer' } },
              },
            },
          },
        ],
      },
      EmailHistoryItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN', 'PAUSED', 'CANCELLED'],
          },
          kind: { type: 'string', enum: ['AUTOMATIC', 'MANUAL'] },
          createdAt: { type: 'string', format: 'date-time' },
          sentAt: { type: 'string', format: 'date-time', nullable: true },
          notBefore: { type: 'string', format: 'date', nullable: true },
          lastError: { type: 'string', nullable: true },
        },
      },
      Participant: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          sessionId: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          submittedAt: { type: 'string', format: 'date-time', nullable: true },
          emailSummary: {
            type: 'object',
            properties: {
              sentCount: { type: 'integer' },
              lastSentAt: { type: 'string', format: 'date-time', nullable: true },
              latest: { allOf: [ref('EmailHistoryItem')], nullable: true },
            },
          },
          session: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
      Answer: {
        type: 'object',
        required: ['questionId', 'value'],
        properties: {
          questionId: { type: 'string', format: 'uuid' },
          comment: {
            type: 'string',
            maxLength: 2000,
            description: 'Commentaire facultatif associé à une note.',
          },
          value: {
            oneOf: [
              { type: 'string', maxLength: 10000 },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 200 } },
            ],
          },
        },
      },
      Response: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          sessionId: { type: 'string' },
          participantId: { type: 'string', format: 'uuid' },
          language: { type: 'string', enum: ['fr', 'de', 'en'] },
          answers: { type: 'array', items: ref('Answer') },
          submittedAt: { type: 'string', format: 'date-time' },
        },
      },
      Statistics: {
        type: 'object',
        properties: {
          sessions: { type: 'integer' },
          participants: { type: 'integer' },
          responses: { type: 'integer' },
          responseRate: { type: 'number', description: 'Pourcentage de 0 à 100' },
          satisfaction: {
            type: 'number',
            nullable: true,
            description:
              'Moyenne sur 4 étoiles. Les anciennes notes sont normalisées : valeur / maximum initial × 4.',
          },
          pendingWebhooks: { type: 'integer' },
          activity: {
            type: 'array',
            items: {
              type: 'object',
              properties: { month: { type: 'string' }, count: { type: 'integer' } },
            },
          },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                session: { type: 'string' },
                sessionId: {
                  type: 'string',
                  description:
                    'Référence unique de la session, pour distinguer les formations portant le même nom.',
                },
                type: { type: 'string' },
                archived: {
                  type: 'boolean',
                  description: 'Question conservée pour l’historique des réponses.',
                },
                count: { type: 'integer' },
                average: { type: 'number', nullable: true },
                distribution: { type: 'object', additionalProperties: { type: 'integer' } },
                comments: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      WebhookEvent: {
        type: 'object',
        required: [
          'eventId',
          'sessionId',
          'participantId',
          'nom',
          'prenom',
          'email',
          'submittedAt',
          'answers',
        ],
        properties: {
          eventId: { type: 'string', format: 'uuid' },
          sessionId: { type: 'string' },
          participantId: { type: 'string', format: 'uuid' },
          nom: { type: 'string' },
          prenom: { type: 'string' },
          email: { type: 'string', format: 'email' },
          submittedAt: { type: 'string', format: 'date-time' },
          answers: {
            type: 'array',
            items: {
              allOf: [
                ref('Answer'),
                {
                  type: 'object',
                  properties: { label: { type: 'string' }, type: { type: 'string' } },
                },
              ],
            },
          },
        },
      },
    },
  },
};
