import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  const [role] = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return tx.$queryRaw<
      {
        superuser: boolean;
        bypassRls: boolean;
        createRole: boolean;
        createDb: boolean;
        ownsTables: boolean;
        createSchema: boolean;
      }[]
    >`
      SELECT rolsuper AS superuser, rolbypassrls AS "bypassRls", rolcreaterole AS "createRole", rolcreatedb AS "createDb",
        EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner=current_user) AS "ownsTables",
        has_schema_privilege(current_user, 'public', 'CREATE') AS "createSchema"
      FROM pg_roles WHERE rolname=current_user`;
  });
  console.log(JSON.stringify(role));
  if (!role || Object.values(role).some(Boolean)) {
    console.error(
      'Le rôle applicatif possède encore des privilèges étendus. Utiliser un rôle dédié ; voir docs/exploitation-production.md.',
    );
    process.exitCode = 1;
  } else
    console.log(
      'Aucun attribut privilégié ni propriété de table détecté. Vérifier aussi les droits effectifs et les appartenances aux rôles.',
    );
}
main()
  .catch(() => {
    console.error('Contrôle du rôle indisponible. Vérifiez la connexion PostgreSQL.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
