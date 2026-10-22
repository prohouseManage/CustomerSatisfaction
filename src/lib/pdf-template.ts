import { z } from 'zod';

export const templateVariables = [
  'formation',
  'date',
  'formateur',
  'sessionId',
  'prenom',
  'nom',
  'email',
] as const;
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) =>
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) &&
        !value
          .replace(/\{\{(formation|date|formateur|sessionId|prenom|nom|email)\}\}/g, '')
          .match(/[{}]/),
      'Utilisez uniquement les variables proposées, par exemple {{prenom}}.',
    );
export const pdfTemplateSchema = z
  .object({
    name: text(80).pipe(z.string().min(1)),
    heading: text(100).pipe(z.string().min(1)),
    introduction: text(600),
    organizationText: text(280),
    footer: text(180),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue.'),
    layout: z.enum(['CLASSIC', 'BANNER']),
    showEmail: z.boolean(),
    showDescription: z.boolean(),
  })
  .strict();
export type PdfTemplateInput = z.infer<typeof pdfTemplateSchema>;
export type PdfTemplateRecord = PdfTemplateInput & { id: string; builtin: boolean };
export function sessionPdfTemplateKey(session: {
  pdfTemplateId?: string | null;
  pdfPreset?: string;
}) {
  return session.pdfTemplateId || session.pdfPreset || 'hot-classic';
}
export function templateInput(record: PdfTemplateInput): PdfTemplateInput {
  return Object.fromEntries(
    Object.keys(pdfTemplateSchema.shape).map((key) => [key, record[key as keyof PdfTemplateInput]]),
  ) as PdfTemplateInput;
}
export const builtinPdfTemplates: PdfTemplateRecord[] = [
  {
    id: 'hot-classic',
    builtin: true,
    name: 'Classique House of Training',
    heading: 'Votre avis fait la différence',
    introduction:
      'Bonjour {{prenom}},\nMerci d’avoir participé à notre formation. Prenez quelques instants pour partager votre expérience : vos réponses nous aident à améliorer nos formations.',
    organizationText:
      'House of Training accompagne le développement des compétences professionnelles au Luxembourg.',
    footer: 'Merci pour votre participation.\nwww.houseoftraining.lu',
    accentColor: '#c70f6c',
    layout: 'CLASSIC',
    showEmail: true,
    showDescription: false,
  },
  {
    id: 'hot-banner',
    builtin: true,
    name: 'Bandeau House of Training',
    heading: 'Partagez votre expérience',
    introduction:
      'Bonjour {{prenom}},\nVotre retour sur « {{formation}} » est précieux. Scannez votre QR code pour compléter le questionnaire de satisfaction.',
    organizationText:
      'House of Training · La formation au service de votre développement professionnel.',
    footer: 'Ensemble, faisons progresser la qualité de nos formations.\nwww.houseoftraining.lu',
    accentColor: '#5d397d',
    layout: 'BANNER',
    showEmail: false,
    showDescription: false,
  },
];
export function fillTemplate(
  text: string,
  values: Record<(typeof templateVariables)[number], string>,
) {
  return text.replace(
    /\{\{(formation|date|formateur|sessionId|prenom|nom|email)\}\}/g,
    (_, key: keyof typeof values) => values[key],
  );
}
