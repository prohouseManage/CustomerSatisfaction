export const odooOrigins = [
  'https://odoo.uat.houseoftraining.lu',
  'https://www.houseoftraining.lu',
] as const;
export function normalizeOdooUrl(value: string) {
  const url = new URL(value.trim());
  url.pathname = url.pathname.replace(/\/$/, '');
  if (
    !(odooOrigins as readonly string[]).includes(url.origin) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/session\/satisfaction\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(url.pathname)
  )
    throw new Error('Lien de questionnaire House of Training HTTPS invalide.');
  return url.toString();
}
export function isOdooUrl(value: string) {
  try {
    normalizeOdooUrl(value);
    return true;
  } catch {
    return false;
  }
}
