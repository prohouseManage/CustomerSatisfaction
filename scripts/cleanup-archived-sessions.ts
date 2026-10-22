import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { db } = await import('../src/lib/db');
  try {
    const { retentionOverview, purgeArchivedSessions } = await import('../src/lib/retention');
    if (process.argv.includes('--apply'))
      console.log(JSON.stringify(await purgeArchivedSessions(), null, 2));
    else
      console.log(
        JSON.stringify(
          { mode: 'aperçu uniquement, aucune suppression', ...(await retentionOverview()) },
          null,
          2,
        ),
      );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error('Nettoyage indisponible', error instanceof Error ? error.name : 'Error');
  process.exitCode = 1;
});
