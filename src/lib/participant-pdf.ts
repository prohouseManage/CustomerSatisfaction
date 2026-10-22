import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { fillTemplate, type PdfTemplateInput } from './pdf-template';
import { ApiError } from './security';
import { sessionDateRange } from './session-dates';

export type PdfSession = {
  id: string;
  name: string;
  date: Date | string;
  endDate?: Date | string | null;
  trainer: string;
  description: string;
};
export type PdfParticipant = {
  firstName: string;
  lastName: string;
  email: string;
  link: string;
  submittedAt: Date | string | null;
};
let assets: Promise<Buffer[]> | undefined;
const loadAssets = () =>
  (assets ??= Promise.all(
    ['fonts/NotoSans-Regular.ttf', 'fonts/NotoSans-Bold.ttf', 'house-of-training-pdf.png'].map(
      (file) => readFile(join(process.cwd(), 'public', file)),
    ),
  ).catch((error) => {
    assets = undefined;
    throw error;
  }));

/** One A4 page per participant; bounded text boxes never create extra pages. */
export async function participantPdf(
  session: PdfSession,
  participants: PdfParticipant[],
  template: PdfTemplateInput,
  preview = false,
) {
  if (!participants.length)
    throw new ApiError(400, 'Importez des participants avant de générer le PDF.');
  const [regular, bold, logo] = await loadAssets();
  const pdf = new jsPDF({ format: 'a4', compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('NotoSans-Regular.ttf', regular.toString('base64'));
  pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  pdf.addFileToVFS('NotoSans-Bold.ttf', bold.toString('base64'));
  pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  pdf.setProperties({
    title: `Questionnaires — ${session.name}`,
    author: 'House of Training',
    subject: 'Accès personnels au questionnaire de satisfaction',
  });
  const accent = template.accentColor;
  const luminance = [1, 3, 5]
    .map((offset) => parseInt(accent.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const accentInk = luminance > 0.183 ? '#292432' : accent;
  const bannerInk = luminance > 0.183 ? '#292432' : '#ffffff';
  const fit = (
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    size = 10,
    weight: 'normal' | 'bold' = 'normal',
    color = '#292432',
    align: 'left' | 'center' = 'left',
  ) => {
    pdf.setFont('NotoSans', weight);
    let lines: string[] = [];
    let fontSize = size;
    for (; fontSize >= 7; fontSize -= 0.5) {
      pdf.setFontSize(fontSize);
      lines = pdf.splitTextToSize(value.replace(/\r\n?/g, '\n'), width);
      if (lines.length * fontSize * 0.352778 * 1.25 <= height) break;
    }
    if (fontSize < 7)
      throw new ApiError(
        400,
        'Le texte du modèle est trop long pour une page. Raccourcissez le titre, les textes ou les variables répétées.',
      );
    pdf.setTextColor(color);
    pdf.text(lines, align === 'center' ? x + width / 2 : x, y + fontSize * 0.352778, {
      align,
      lineHeightFactor: 1.25,
    });
  };
  for (let index = 0; index < participants.length; index++) {
    if (index) pdf.addPage();
    const p = participants[index];
    const values = {
      formation: session.name,
      date: sessionDateRange(session.date, session.endDate, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      formateur: session.trainer,
      sessionId: session.id,
      prenom: p.firstName,
      nom: p.lastName,
      email: p.email,
    };
    const t = (value: string) => fillTemplate(value, values);
    pdf.addImage(logo, 'PNG', 17, 14, 60, 18.87, 'hot-logo');
    fit('QUESTIONNAIRE DE SATISFACTION', 112, 19, 81, 10, 8, 'bold', accentInk);
    if (template.layout === 'BANNER') {
      pdf.setFillColor(accent);
      pdf.rect(0, 39, 210, 32, 'F');
      fit(t(template.heading), 17, 44, 176, 24, 21, 'bold', bannerInk);
    } else {
      pdf.setFillColor(accent);
      pdf.rect(17, 43, 1.5, 22, 'F');
      fit(t(template.heading), 23, 43, 170, 24, 21, 'bold');
    }
    fit(t(template.organizationText), 17, 75, 176, 11, 9, 'normal', '#625b69');
    fit(t(template.introduction), 17, 90, 176, 22, 10);
    pdf.setFillColor('#f6f4f8');
    pdf.roundedRect(17, 117, 176, 55, 3, 3, 'F');
    fit('VOTRE FORMATION', 22, 121, 166, 5, 8, 'bold', accentInk);
    fit(session.name, 22, 128, 166, 14, 13, 'bold');
    fit(
      `Date : ${values.date}   ·   Référence : ${session.id}\nFormateur : ${session.trainer}`,
      22,
      144,
      166,
      template.showDescription ? 12 : 22,
      9,
    );
    if (template.showDescription && session.description) {
      const excerpt =
        session.description.length > 220
          ? `${session.description.slice(0, 217)}…`
          : session.description;
      fit(
        `Présentation${session.description.length > 220 ? ' (extrait)' : ''} : ${excerpt}`,
        22,
        158,
        166,
        11,
        8,
      );
    }
    fit(`Destinataire : ${p.firstName} ${p.lastName}`, 17, 177, 176, 12, 11, 'bold');
    if (template.showEmail) fit(p.email, 17, 190, 176, 6, 9, 'normal', '#625b69');
    const qr = await QRCode.toDataURL(p.link, { width: 600, margin: 4, errorCorrectionLevel: 'M' });
    pdf.addImage(qr, 'PNG', 78, 200, 54, 54, `qr-${index}`);
    pdf.link(78, 200, 54, 54, { url: p.link });
    const instruction = preview
      ? 'APERÇU — QR code de démonstration'
      : p.submittedAt
        ? 'Questionnaire déjà complété — lien inactif'
        : 'Scannez ce QR code pour donner votre avis';
    fit(instruction, 17, 258, 176, 6, 10, 'bold', accentInk, 'center');
    fit(
      'Accès personnel · Une seule réponse possible\nVous pouvez aussi cliquer sur le QR code dans ce PDF.',
      17,
      266,
      176,
      10,
      8,
      'normal',
      '#625b69',
      'center',
    );
    pdf.setDrawColor('#e5e0e8');
    pdf.line(17, 279, 193, 279);
    fit(t(template.footer), 17, 282, 157, 11, 8, 'normal', '#625b69');
    fit(`${index + 1} / ${participants.length}`, 177, 284, 16, 6, 8, 'normal', '#625b69', 'center');
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
export function pdfResponse(bytes: Uint8Array, filename: string, inline = false) {
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
