import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

async function check(label: string, value: string | undefined) {
  if (!value) throw new Error(`${label} est absent.`);
  const db = new PrismaClient({ datasourceUrl: value });
  try {
    await db.$queryRaw`SELECT 1`;
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    console.log(`${label} : connexion PostgreSQL réussie.`);
    console.log(
      `Tables publiques : ${tables.map((table) => table.tablename).join(', ') || 'aucune'}.`,
    );
    const security = await db.$queryRaw<
      { name: string; rls: boolean; anon_access: boolean; authenticated_access: boolean }[]
    >`
      SELECT c.relname AS name, c.relrowsecurity AS rls,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `;
    for (const table of security) {
      console.log(
        `${table.name} : RLS=${table.rls}, droits anon=${table.anon_access}, droits authenticated=${table.authenticated_access}.`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  await check('DATABASE_URL', process.env.DATABASE_URL);
  await check('DIRECT_URL', process.env.DIRECT_URL);
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === 'object' && 'errorCode' in error ? error.errorCode : undefined;
  console.error(`Connexion PostgreSQL échouée${code ? ` (${code})` : ''}.`);
  process.exitCode = 1;
});
