import { z } from 'zod';
import { isOdooUrl } from './odoo-url';
import { emailScheduleInputSchema, emailReactivationSchema } from './email-policy';
export const questionTypes = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'NUMBER',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'RATING_4',
  'RATING_5',
  'RATING_10',
  'YES_NO',
  'SELECT',
] as const;
export const typeLabels: Record<(typeof questionTypes)[number], string> = {
  SHORT_TEXT: 'Texte court',
  LONG_TEXT: 'Texte long',
  NUMBER: 'Nombre',
  SINGLE_CHOICE: 'Choix unique',
  MULTIPLE_CHOICE: 'Choix multiple',
  RATING_4: 'Note de 1 à 4 étoiles',
  RATING_5: 'Note de 1 à 5',
  RATING_10: 'Note de 1 à 10',
  YES_NO: 'Oui / Non',
  SELECT: 'Liste déroulante',
};
export const questionSchema = z
  .object({
    label: z.string().trim().min(3).max(500),
    type: z.enum(questionTypes),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    translations: z
      .object({
        de: z
          .object({
            label: z.string().trim().min(3).max(500),
            options: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
          })
          .strict()
          .optional(),
        en: z
          .object({
            label: z.string().trim().min(3).max(500),
            options: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .superRefine((q, ctx) => {
    for (const lang of ['de', 'en'] as const) {
      const options = q.translations?.[lang]?.options;
      if (
        options &&
        (options.length !== q.options.length || new Set(options).size !== options.length)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['translations', lang, 'options'],
          message: 'Traduisez chaque choix dans le même ordre, sans doublon.',
        });
    }
    if (
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SELECT'].includes(q.type) &&
      (q.options.length < 2 || new Set(q.options).size !== q.options.length)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Au moins deux choix distincts sont requis.',
      });
  });
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Date invalide.',
  );
export const sessionSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[A-Z0-9][A-Z0-9_-]{2,49}$/,
        'Identifiant : 3 à 50 caractères, lettres majuscules, chiffres, tirets.',
      ),
    name: z.string().trim().min(3).max(200),
    date: calendarDateSchema,
    endDate: calendarDateSchema.nullish(),
    responseDeadline: calendarDateSchema.nullish(),
    formLanguage: z.enum(['fr', 'de', 'en', 'auto']).optional(),
    trainer: z.string().trim().min(2).max(150),
    description: z.string().trim().max(3000).default(''),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
    questions: z.array(questionSchema).min(1).max(50),
    odooUrl: z
      .string()
      .trim()
      .max(2048)
      .refine(
        (v) => !v || isOdooUrl(v),
        'Lien de questionnaire Odoo invalide. Utilisez un lien HTTPS House of Training de production ou préproduction.',
      )
      .optional(),
    odooEnabled: z.boolean().optional(),
    emailSchedule: emailScheduleInputSchema,
    emailReactivation: emailReactivationSchema.optional(),
  })
  .superRefine((session, ctx) => {
    if (session.endDate && session.endDate < session.date)
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'La date de fin doit être égale ou postérieure à la date de début.',
      });
  });
export const participantSchema = z.object({
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
});
export type QuestionInput = z.infer<typeof questionSchema>;
export type Answer = {
  questionId: string;
  value: string | number | boolean | string[];
  comment?: string;
};
export function ratingMax(type: string): number | null {
  return type === 'RATING_4' ? 4 : type === 'RATING_5' ? 5 : type === 'RATING_10' ? 10 : null;
}
export const submitSchema = z
  .object({
    language: z.enum(['fr', 'de', 'en']).optional(),
    sessionId: z.string().min(3).max(50),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    answers: z
      .array(
        z.object({
          questionId: z.string().uuid(),
          comment: z.string().trim().max(2000).optional(),
          value: z.union([
            z.string().max(10000),
            z.number().finite(),
            z.boolean(),
            z.array(z.string().max(200)).max(30),
          ]),
        }),
      )
      .max(50),
  })
  .strict();
export function validateAnswers(
  questions: (Omit<QuestionInput, 'translations'> & { id: string })[],
  answers: Answer[],
) {
  const ids = new Set(questions.map((q) => q.id));
  if (
    new Set(answers.map((a) => a.questionId)).size !== answers.length ||
    answers.some((a) => !ids.has(a.questionId))
  )
    throw new Error('Questions inconnues ou réponses dupliquées.');
  return questions.flatMap((q) => {
    const answer = answers.find((a) => a.questionId === q.id);
    const value = answer?.value;
    const comment = answer?.comment;
    if (comment !== undefined && (typeof comment !== 'string' || comment.length > 2000))
      throw new Error(`Commentaire invalide : ${q.label}`);
    if (comment?.trim() && ratingMax(q.type) === null)
      throw new Error(`Ce type de question ne permet pas de commentaire associé : ${q.label}`);
    const empty =
      value === undefined ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && !value.length);
    if (empty) {
      if (q.required) throw new Error(`Réponse obligatoire : ${q.label}`);
      if (comment?.trim())
        throw new Error(`Choisissez une note avant d’ajouter un commentaire : ${q.label}`);
      return [];
    }
    let valid = false;
    switch (q.type) {
      case 'SHORT_TEXT':
        valid = typeof value === 'string' && value.length <= 500;
        break;
      case 'LONG_TEXT':
        valid = typeof value === 'string' && value.length <= 10000;
        break;
      case 'NUMBER':
        valid = typeof value === 'number' && Number.isFinite(value);
        break;
      case 'RATING_4':
      case 'RATING_5':
      case 'RATING_10':
        valid =
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= ratingMax(q.type)!;
        break;
      case 'YES_NO':
        valid = typeof value === 'boolean';
        break;
      case 'SINGLE_CHOICE':
      case 'SELECT':
        valid = typeof value === 'string' && q.options.includes(value);
        break;
      case 'MULTIPLE_CHOICE':
        valid =
          Array.isArray(value) &&
          new Set(value).size === value.length &&
          value.every((v) => q.options.includes(v));
        break;
    }
    if (!valid) throw new Error(`Réponse invalide : ${q.label}`);
    return [
      { questionId: q.id, value: value!, ...(comment?.trim() ? { comment: comment.trim() } : {}) },
    ];
  });
}
export const legacyDefaultQuestions: QuestionInput[] = [
  {
    label: 'La formation correspondait à mes attentes.',
    type: 'RATING_5',
    required: true,
    options: [],
  },
  {
    label: 'Comment évaluez-vous la qualité du formateur ?',
    type: 'RATING_5',
    required: true,
    options: [],
  },
  {
    label: 'Les acquis seront utiles dans mon activité professionnelle.',
    type: 'RATING_5',
    required: true,
    options: [],
  },
  { label: 'Vos commentaires et suggestions', type: 'LONG_TEXT', required: false, options: [] },
];
export const defaultQuestions: QuestionInput[] = [
  'La formation correspondait globalement à mes attentes',
  'Le formateur maitrisait son sujet',
  "Le formateur s'est montré pédagogue",
  'Le formateur était ponctuel et a respecté les horaires',
  "L'équilibre entre la théorie et la pratique a été respecté",
  'Le contenu de la formation correspondait aux objectifs annoncés',
  'Le matériel pédagogique (supports, outils, etc.) était pertinent et actualisé',
  'Le format « Présentiel, Distanciel et/ou Blended » était adapté',
  'La durée de la formation était adéquate par rapport aux objectifs et adaptée à notre rythme professionnel',
  'Les équipements étaient de qualité',
  "L'encadrement et l'organisation de la formation étaient de qualité",
].map((label) => ({ label, type: 'RATING_4' as const, required: true, options: [] }));
defaultQuestions.push({
  label: 'Suggestions d’amélioration',
  type: 'LONG_TEXT',
  required: false,
  options: [],
});
