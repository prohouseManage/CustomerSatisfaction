import { roleLabels, type StaffRole } from './staff-policy';
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function collaborationEmail(input: {
  name: string;
  role: StaffRole;
  url: string;
  expiresAt: Date;
}) {
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Lien invalide.');
  const expiry = input.expiresAt.toLocaleString('fr-LU', {
    timeZone: 'Europe/Luxembourg',
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const greeting = input.name ? `Bonjour ${input.name},` : 'Bonjour,';
  const subject = 'Votre invitation à Écoute · House of Training';
  const text = `${greeting}\n\nVous êtes invité(e) à rejoindre Écoute, l’espace de satisfaction House of Training, avec le rôle ${roleLabels[input.role]}.\n\nCréez votre accès et choisissez votre mot de passe :\n${input.url}\n\nCette invitation personnelle est valable jusqu’au ${expiry} (heure de Luxembourg). Elle ne peut être utilisée qu’une fois. Ne transférez pas ce lien.\n\nSi vous ne connaissez pas cette invitation, ignorez ce message.\n\nL’équipe House of Training`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f7f7fa;font-family:Arial,sans-serif;color:#272331"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" style="max-width:580px;background:white;border:1px solid #eceaf0;border-radius:12px"><tr><td style="padding:32px"><img src="${escape(new URL('/house-of-training-pdf.png', url).href)}" width="160" alt="House of Training"><h1 style="font-size:26px;line-height:34px;margin:28px 0 16px">Bienvenue dans votre équipe.</h1><p style="font-size:15px;line-height:24px">${escape(greeting)}</p><p style="font-size:15px;line-height:24px">Vous êtes invité(e) à rejoindre <strong>Écoute</strong>, l’espace de satisfaction House of Training, avec le rôle <strong>${roleLabels[input.role]}</strong>.</p><p style="font-size:15px;line-height:24px">Activez votre compte et choisissez votre mot de passe.</p><table role="presentation"><tr><td bgcolor="#cb1a70" style="border-radius:6px"><a href="${escape(input.url)}" style="display:inline-block;padding:12px 20px;font-size:14px;line-height:20px;font-weight:bold;color:white;text-decoration:none">Accepter l’invitation</a></td></tr></table><p style="font-size:13px;line-height:21px;color:#686271;margin-top:24px">Lien personnel valable jusqu’au ${escape(expiry)}, heure de Luxembourg. Une seule activation possible. Ne transférez pas cette invitation.</p><p style="font-size:12px;line-height:20px;color:#686271">Si le bouton ne fonctionne pas :<br><a href="${escape(input.url)}" style="color:#ad135e;word-break:break-all">${escape(input.url)}</a></p><p style="font-size:12px;line-height:20px;color:#686271">Si vous ne connaissez pas cette invitation, ignorez ce message.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
