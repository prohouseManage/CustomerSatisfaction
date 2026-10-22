import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { upgradeStandardQuestionnaires } from '../src/lib/questionnaire-upgrade';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
upgradeStandardQuestionnaires(db, process.argv.includes('--apply'))
  .then((result) => console.log(JSON.stringify(result)))
  .catch(() => {
    console.error(
      'Mise à jour des questionnaires impossible. Aucune réponse ne doit être supprimée.',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
