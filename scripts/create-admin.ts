import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  const email = z.string().email().parse(process.env.ADMIN_EMAIL?.trim().toLowerCase());
  const password = z
    .string()
    .min(12)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, '72 octets maximum')
    .parse(process.env.ADMIN_PASSWORD);
  const name = z
    .string()
    .trim()
    .min(2)
    .max(100)
    .parse(process.env.ADMIN_NAME || 'Administrateur');
  const exists = await db.admin.findUnique({ where: { email } });
  if (exists && !process.argv.includes('--reset-password'))
    throw new Error(
      'Ce compte existe. Utilisez -- --reset-password pour changer son mot de passe.',
    );
  const passwordHash = await hash(password, 12);
  await db.admin.upsert({
    where: { email },
    create: { email, name, passwordHash },
    update: { name, passwordHash },
  });
  console.log(exists ? 'Mot de passe administrateur mis à jour.' : 'Compte administrateur créé.');
}
main()
  .catch((e) => {
    console.error(
      e instanceof z.ZodError
        ? 'ADMIN_EMAIL, ADMIN_PASSWORD (12 caractères minimum, 72 octets maximum) et ADMIN_NAME doivent être valides.'
        : e.message,
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
