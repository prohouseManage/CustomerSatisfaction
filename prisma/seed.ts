import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { defaultQuestions } from '../src/lib/validation';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  const id = 'DORA-2026-001';
  const existing = await db.trainingSession.findUnique({ where: { id } });
  if (existing) {
    console.log('La session existe déjà. Aucune donnée modifiée.');
    return;
  }
  await db.trainingSession.create({
    data: {
      id,
      name: 'DORA Foundation',
      date: new Date('2026-12-11'),
      trainer: 'Jean Dupont',
      description: 'Comprendre la résilience opérationnelle numérique et le cadre DORA.',
      status: 'DRAFT',
      questions: { create: defaultQuestions.map((q, position) => ({ ...q, position })) },
    },
  });
  console.log('Session exemple créée en brouillon, sans participant ni réponse fictive.');
}
main()
  .catch(() => {
    console.error('Échec du seed. Vérifiez la connexion PostgreSQL et les migrations.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
