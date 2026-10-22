export const languages = ['fr', 'de', 'en'] as const;
export type Language = (typeof languages)[number];
export type QuestionTranslations = Partial<
  Record<'de' | 'en', { label: string; options?: string[] }>
>;
export const languageNames: Record<Language, string> = {
  fr: 'Français',
  de: 'Deutsch',
  en: 'English',
};
export const languageCode = (value: unknown): Language =>
  languages.includes(value as Language) ? (value as Language) : 'fr';
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const standard = [
  [
    'La formation correspondait globalement à mes attentes',
    'Die Weiterbildung entsprach insgesamt meinen Erwartungen.',
    'Overall, the training met my expectations.',
  ],
  [
    'Le formateur maitrisait son sujet',
    'Die Lehrperson beherrschte das Thema.',
    'The trainer demonstrated expertise in the subject.',
  ],
  [
    "Le formateur s'est montré pédagogue",
    'Die Lehrperson vermittelte die Inhalte verständlich.',
    'The trainer explained the material clearly.',
  ],
  [
    'Le formateur était ponctuel et a respecté les horaires',
    'Die Lehrperson war pünktlich und hielt den Zeitplan ein.',
    'The trainer was punctual and kept to the schedule.',
  ],
  [
    "L'équilibre entre la théorie et la pratique a été respecté",
    'Theorie und Praxis waren ausgewogen.',
    'There was a good balance between theory and practice.',
  ],
  [
    'Le contenu de la formation correspondait aux objectifs annoncés',
    'Die Schulungsinhalte entsprachen den angekündigten Lernzielen.',
    'The training content matched the stated objectives.',
  ],
  [
    'Le matériel pédagogique (supports, outils, etc.) était pertinent et actualisé',
    'Die Schulungsmaterialien (Unterlagen, Werkzeuge usw.) waren relevant und aktuell.',
    'The training materials (documents, tools, etc.) were relevant and up to date.',
  ],
  [
    'Le format « Présentiel, Distanciel et/ou Blended » était adapté',
    'Das Format (Präsenz, online und/oder Blended Learning) war angemessen.',
    'The format (in person, online and/or blended) was appropriate.',
  ],
  [
    'La durée de la formation était adéquate par rapport aux objectifs et adaptée à notre rythme professionnel',
    'Die Dauer der Weiterbildung passte zu den Lernzielen und zu unserem beruflichen Alltag.',
    'The training duration was appropriate for the objectives and compatible with our work schedules.',
  ],
  [
    'Les équipements étaient de qualité',
    'Die Ausstattung war von guter Qualität.',
    'The equipment was of good quality.',
  ],
  [
    "L'encadrement et l'organisation de la formation étaient de qualité",
    'Die Betreuung und Organisation der Weiterbildung waren von guter Qualität.',
    'The training was well organised and supported.',
  ],
  ['Suggestions d’amélioration', 'Verbesserungsvorschläge', 'Suggestions for improvement'],
];
export function questionTranslations(q: {
  label: string;
  translations?: unknown;
}): QuestionTranslations {
  const standardRow = standard.find((row) => normalize(row[0]) === normalize(q.label));
  const result: QuestionTranslations = standardRow
    ? { de: { label: standardRow[1] }, en: { label: standardRow[2] } }
    : {};
  if (q.translations && typeof q.translations === 'object')
    for (const lang of ['de', 'en'] as const) {
      const entry = (q.translations as Record<string, unknown>)[lang];
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { label?: unknown }).label === 'string'
      ) {
        const value = entry as { label: string; options?: unknown };
        if (value.label.trim())
          result[lang] = {
            label: value.label,
            ...(Array.isArray(value.options) && value.options.every((o) => typeof o === 'string')
              ? { options: value.options as string[] }
              : {}),
          };
      }
    }
  return result;
}
export function displayQuestion(
  q: { label: string; options: string[]; translations?: unknown },
  language: Language,
) {
  const entry = language === 'fr' ? undefined : questionTranslations(q)[language];
  return {
    label: entry?.label || q.label,
    options: entry?.options?.length === q.options.length ? entry.options : q.options,
    missing:
      language !== 'fr' &&
      (!entry || (q.options.length > 0 && entry.options?.length !== q.options.length)),
  };
}
