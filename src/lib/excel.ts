import * as XLSX from 'xlsx';
import { participantSchema } from './validation';
export function parseParticipants(data: Buffer) {
  if (data.length > 2_000_000 || data.readUInt32LE(0) !== 0x04034b50)
    throw new Error('Un fichier .xlsx valide de 2 Mo maximum est requis.');
  // Reject oversized ZIP archives before SheetJS expands XML content.
  let uncompressed = 0,
    entries = 0;
  for (let i = 0; i <= data.length - 46; i++) {
    if (data.readUInt32LE(i) !== 0x02014b50) continue;
    uncompressed += data.readUInt32LE(i + 24);
    entries++;
    if (uncompressed > 20_000_000 || entries > 200)
      throw new Error('Le fichier Excel décompressé est trop volumineux.');
    i += 45 + data.readUInt16LE(i + 28) + data.readUInt16LE(i + 30) + data.readUInt16LE(i + 32);
  }
  if (!entries) throw new Error('Archive Excel invalide.');
  const workbook = XLSX.read(data, {
    type: 'buffer',
    sheetRows: 1002,
    cellHTML: false,
    cellFormula: false,
  });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (rows.length < 2 || rows.length > 1001)
    throw new Error('Le fichier doit contenir de 1 à 1 000 participants.');
  const normalize = (v: unknown) =>
    String(v)
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const header = rows[0].map(normalize),
    indices = ['nom', 'prenom', 'email'].map((h) => header.indexOf(h));
  if (indices.some((i) => i < 0))
    throw new Error('Les colonnes Nom, Prénom et Email sont requises.');
  const participants = rows.slice(1).map((row, index) => {
    const result = participantSchema.safeParse({
      lastName: String(row[indices[0]] ?? ''),
      firstName: String(row[indices[1]] ?? ''),
      email: String(row[indices[2]] ?? ''),
    });
    if (!result.success) throw new Error(`Ligne ${index + 2} : nom, prénom ou e-mail invalide.`);
    return result.data;
  });
  if (new Set(participants.map((p) => p.email)).size !== participants.length)
    throw new Error('Des e-mails apparaissent plusieurs fois dans le fichier.');
  return participants;
}
export function excelResponse(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string,
) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((s) =>
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(s.rows), s.name),
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
