import { sessionDateRange } from './session-dates';
export type InvitationEmailInput = {
  firstName: string;
  sessionName: string;
  date: Date;
  endDate?: Date | null;
  url: string;
  trainer?: string;
  sessionId?: string;
  /** Used by the standalone preview; production uses the public application logo. */
  logoUrl?: string;
};

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function invitationEmail(input: InvitationEmailInput) {
  const link = new URL(input.url);
  if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password)
    throw new Error('Lien de questionnaire invalide pour l’e-mail.');
  const date = sessionDateRange(input.date, input.endDate, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const subject = `Votre avis compte — ${input.sessionName}`.replace(/[\r\n]+/g, ' ').trim();
  const url = escape(input.url);
  const logo = escape(input.logoUrl || new URL('/house-of-training-pdf.png', link).href);
  const name = escape(input.firstName);
  const formation = escape(input.sessionName);
  const context = [
    `Formation : ${input.sessionName}`,
    `Date : ${date}`,
    ...(input.trainer ? [`Formateur : ${input.trainer}`] : []),
    ...(input.sessionId ? [`Référence de session : ${input.sessionId}`] : []),
  ].join('\n');
  const text = `HOUSE OF TRAINING\nVotre avis fait la différence.\n\nBonjour ${input.firstName},\n\nMerci d’avoir choisi House of Training pour votre formation.\n\n${context}\n\nVotre expérience nous intéresse. Nous vous invitons à répondre à notre questionnaire de satisfaction pour nous faire part de vos impressions et de vos suggestions.\n\nVos retours nous aident à améliorer nos formations et la qualité de notre accompagnement.\n\nRépondre au questionnaire :\n${input.url}\n\nCe lien vous est personnel. Merci de ne pas le transférer. Vous pouvez envoyer vos réponses une seule fois ; le lien sera ensuite désactivé.\n\nMerci pour votre participation et votre confiance.\n\nL’équipe House of Training\nwww.houseoftraining.lu`;
  const detail = (label: string, value: string) =>
    `<tr><td valign="top" style="padding:6px 12px 6px 0;color:#777181;font-size:13px;line-height:20px;width:90px;">${label}</td><td valign="top" style="padding:6px 0;color:#272331;font-size:14px;line-height:20px;overflow-wrap:anywhere;">${escape(value)}</td></tr>`;
  const html = `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Votre avis compte · House of Training</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
    @media only screen and (max-width:600px){
      .outer-padding{padding:16px 10px!important;}
      .content-padding{padding:28px 22px!important;}
      .email-heading{font-size:28px!important;line-height:34px!important;}
      .brand-padding{padding:26px 22px 22px!important;}
      .formation-padding{padding:20px!important;}
      .cta-link{max-width:100%!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f5f4f8;font-family:Arial,Helvetica,sans-serif;color:#272331;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f5f4f8;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Votre retour sur la formation « ${formation} » nous aide à améliorer votre expérience.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f4f8">
    <tr><td align="center" class="outer-padding" style="padding:36px 16px;">
      <!--[if mso]><table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;">
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e9e5ef;border-radius:14px;">
            <tr><td height="5" bgcolor="#cb1a70" style="height:5px;font-size:0;line-height:5px;border-radius:14px 14px 0 0;">&nbsp;</td></tr>
            <tr><td class="brand-padding" style="padding:32px 40px 26px;">
              <img src="${logo}" width="181" height="57" alt="House of Training" style="display:block;width:181px;height:57px;max-width:100%;">
            </td></tr>
            <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#eeeaf1" style="font-size:0;line-height:1px;height:1px;">&nbsp;</td></tr></table></td></tr>
            <tr><td class="content-padding" style="padding:32px 40px 36px;">
              <p style="margin:0 0 12px;color:#cb1a70;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">Enquête de satisfaction</p>
              <h1 class="email-heading" style="margin:0 0 26px;color:#272331;font-size:34px;line-height:40px;font-weight:bold;letter-spacing:-0.7px;">Votre avis fait<br>la différence.</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:25px;">Bonjour ${name},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:25px;color:#575060;">Merci d’avoir choisi <strong style="color:#272331;">House of Training</strong> pour votre formation.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f6fa" style="background-color:#f8f6fa;border:1px solid #ece7f0;border-radius:9px;">
                <tr><td class="formation-padding" style="padding:22px 24px;">
                  <p style="margin:0 0 10px;color:#755191;font-size:10px;line-height:15px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;">Votre formation</p>
                  <p style="margin:0 0 12px;color:#272331;font-size:18px;line-height:26px;font-weight:bold;overflow-wrap:anywhere;">${formation}</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${detail('Date', date)}
                    ${input.trainer ? detail('Formateur', input.trainer) : ''}
                    ${input.sessionId ? detail('Référence', input.sessionId) : ''}
                  </table>
                </td></tr>
              </table>
              <p style="margin:24px 0 14px;color:#272331;font-size:15px;line-height:25px;font-weight:bold;">Votre expérience nous intéresse.</p>
              <p style="margin:0 0 14px;color:#575060;font-size:15px;line-height:25px;">Nous vous invitons à répondre à notre questionnaire de satisfaction pour nous faire part de vos impressions et de vos suggestions.</p>
              <p style="margin:0 0 26px;color:#575060;font-size:15px;line-height:25px;">Vos retours nous aident à améliorer nos formations et la qualité de notre accompagnement.</p>
              <table role="presentation" class="cta-table" cellpadding="0" cellspacing="0" border="0" style="width:auto;margin:0 0 20px;">
                <tr><td align="left" valign="middle" style="padding:0;">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:44px;v-text-anchor:middle;width:250px;" arcsize="14%" strokecolor="#cb1a70" fillcolor="#cb1a70">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Répondre au questionnaire</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a class="cta-link" href="${url}" style="display:inline-block;background-color:#cb1a70;padding:12px 18px;border-radius:6px;color:#ffffff;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;text-align:center;mso-hide:all;">Répondre au questionnaire</a>
                  <!--<![endif]-->
                </td></tr>
              </table>
              <p style="margin:0 0 26px;color:#85808e;font-size:12px;line-height:19px;">Ce lien vous est personnel. Merci de ne pas le transférer. Vous pouvez envoyer vos réponses une seule fois ; le lien sera ensuite désactivé.</p>
              <p style="margin:0 0 6px;color:#575060;font-size:15px;line-height:24px;">Merci pour votre participation et votre confiance.</p>
              <p style="margin:0;color:#272331;font-size:15px;line-height:24px;font-weight:bold;">L’équipe House of Training</p>
            </td></tr>
            <tr><td class="content-padding" bgcolor="#fcfbfd" style="padding:22px 40px;background-color:#fcfbfd;border-top:1px solid #eeeaf1;border-radius:0 0 14px 14px;">
              <p style="margin:0 0 7px;color:#85808e;font-size:11px;line-height:18px;">Si le bouton ne s’affiche pas, copiez ce lien dans votre navigateur :</p>
              <p style="margin:0;font-size:11px;line-height:18px;overflow-wrap:anywhere;word-break:break-all;"><a href="${url}" style="color:#755191;text-decoration:underline;word-break:break-all;">${url}</a></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:22px 20px 4px;color:#8b8594;font-size:11px;line-height:19px;">
          <p style="margin:0 0 5px;font-weight:bold;letter-spacing:0.8px;">LA QUALITÉ COMMENCE PAR L’ÉCOUTE.</p>
          <p style="margin:0;">House of Training · Luxembourg</p>
          <p style="margin:5px 0 0;"><a href="https://www.houseoftraining.lu" style="color:#755191;text-decoration:none;">www.houseoftraining.lu</a></p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}
