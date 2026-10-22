import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFString, PDFDict, PDFArray } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { participantPdf } from '../src/lib/participant-pdf';
import {
  builtinPdfTemplates,
  pdfTemplateSchema,
  templateInput,
  fillTemplate,
} from '../src/lib/pdf-template';

const session = {
  id: 'DORA-2026-001',
  name: 'DORA Foundation',
  date: new Date('2026-12-11'),
  trainer: 'Jean Dupont',
  description: 'Une formation professionnelle pour développer vos compétences.',
};
const participants = ['Élodie', 'Marie', 'Jean', 'Chloé', 'François'].map((firstName, i) => ({
  firstName,
  lastName: `Participant ${i + 1}`,
  email: `participant${i + 1}@example.com`,
  link: `https://formation.example.com/form/DORA-2026-001/demo-${i + 1}`,
  submittedAt: i === 4 ? new Date() : null,
}));

test('Invitations : cinq participants donnent exactement cinq pages A4, avec un lien personnel par page, dans les deux modèles', async () => {
  for (const template of builtinPdfTemplates) {
    const bytes = await participantPdf(session, participants, templateInput(template));
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), participants.length);
    for (const [index, page] of pdf.getPages().entries()) {
      assert.ok(Math.abs(page.getWidth() - 595.28) < 0.2);
      assert.ok(Math.abs(page.getHeight() - 841.89) < 0.2);
      const annotations = page.node.lookup(PDFName.of('Annots'), PDFArray);
      assert.equal(annotations.size(), 1);
      const annotation = annotations.lookup(0, PDFDict);
      const action = annotation.lookup(PDFName.of('A'), PDFDict);
      assert.equal(
        action.lookup(PDFName.of('URI'), PDFString).decodeText(),
        participants[index].link,
      );
    }
    await mkdir('test-results', { recursive: true });
    await writeFile(`test-results/invitations-${template.id}.pdf`, bytes);
  }
});
test('Un modèle personnalisé et des informations longues restent sur une page', async () => {
  const template = {
    ...templateInput(builtinPdfTemplates[0]),
    showDescription: true,
    organizationText: 'House of Training accompagne votre développement professionnel. '.repeat(4),
    footer: 'Merci pour votre participation. '.repeat(5),
  };
  const bytes = await participantPdf(
    {
      ...session,
      name: 'Formation professionnelle et développement des compétences '.repeat(3),
      trainer: 'Jean Dupont et Marie Martin — accompagnement pédagogique professionnel',
      description: 'Présentation détaillée de la formation. '.repeat(100),
    },
    [
      {
        ...participants[0],
        firstName: 'Élodie-Marie',
        lastName: 'Dupont de la Formation Professionnelle',
      },
    ],
    template,
  );
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});
test('Les modèles refusent les variables inconnues, couleurs invalides et champs inattendus', () => {
  const template = templateInput(builtinPdfTemplates[0]);
  assert.equal(pdfTemplateSchema.safeParse(template).success, true);
  for (const patch of [
    { heading: '{{token}}' },
    { accentColor: 'red' },
    { injected: true },
    { name: '' },
  ])
    assert.equal(pdfTemplateSchema.safeParse({ ...template, ...patch }).success, false);
  assert.equal(
    fillTemplate('Bonjour {{prenom}} — {{formation}}', {
      prenom: 'Élodie',
      nom: 'Dupont',
      email: 'test@example.com',
      formation: 'DORA',
      date: '',
      sessionId: '',
      formateur: '',
    }),
    'Bonjour Élodie — DORA',
  );
});
test('Aucun participant : refus explicite ; textes impossibles à faire tenir : refus sans troncature silencieuse', async () => {
  await assert.rejects(
    participantPdf(session, [], templateInput(builtinPdfTemplates[0])),
    /Importez des participants/,
  );
  await assert.rejects(
    participantPdf({ ...session, name: 'Formation '.repeat(20) }, participants.slice(0, 1), {
      ...templateInput(builtinPdfTemplates[0]),
      heading: '{{formation}}'.repeat(7),
    }),
    /trop long/,
  );
});
