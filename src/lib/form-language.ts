import { languages, type Language } from './question-i18n';
export const formLanguages = ['fr', 'de', 'en', 'auto'] as const;
export type FormLanguage = (typeof formLanguages)[number];
/** The primary browser preference selects FR/DE/EN; any other language falls back to EN. */
export function browserFormLanguage(header?: string | null): Language {
  const preferences = (header || '')
    .slice(0, 2048)
    .split(',')
    .slice(0, 30)
    .flatMap((part, index) => {
      const [tag, ...params] = part
        .trim()
        .toLowerCase()
        .split(';')
        .map((s) => s.trim());
      if (tag !== '*' && !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(tag)) return [];
      const quality = params.find((p) => p.startsWith('q='))?.slice(2);
      if (quality !== undefined && !/^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/.test(quality)) return [];
      const q = quality === undefined ? 1 : Number(quality);
      return q > 0 ? [{ tag, q, index }] : [];
    })
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const primary = preferences[0]?.tag.split('-')[0];
  return languages.includes(primary as Language) ? (primary as Language) : 'en';
}
export function initialFormLanguage({
  requested,
  configured = 'fr',
  acceptLanguage,
}: {
  requested?: unknown;
  configured?: string;
  acceptLanguage?: string | null;
}): Language {
  if (languages.includes(requested as Language)) return requested as Language;
  if (configured === 'auto') return browserFormLanguage(acceptLanguage);
  return languages.includes(configured as Language) ? (configured as Language) : 'fr';
}
