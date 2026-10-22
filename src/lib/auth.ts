import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db, configured } from './db';
import { hashToken } from './crypto';
import { passwordVersion, passwordVersionMatches } from './auth-session';
// Dynamic import in authorize avoids a circular initialization with security.ts.
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user)
        token.passwordVersion = (user as typeof user & { passwordVersion: string }).passwordVersion;
      if (user)
        token.sessionVersion = (user as typeof user & { sessionVersion: number }).sessionVersion;
      return token;
    },
    async session({ session, token }) {
      const admin =
        typeof token.email === 'string'
          ? await db.admin.findUnique({ where: { email: token.email } })
          : null;
      if (
        !admin ||
        !admin.enabled ||
        token.sessionVersion !== admin.sessionVersion ||
        !process.env.NEXTAUTH_SECRET ||
        !passwordVersionMatches(
          token.passwordVersion,
          admin.passwordHash,
          process.env.NEXTAUTH_SECRET,
        )
      ) {
        return { ...session, user: undefined };
      }
      return { ...session, user: { name: admin.name, email: admin.email } };
    },
  },
  providers: [
    CredentialsProvider({
      name: 'Administrateur',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!configured() || !process.env.NEXTAUTH_SECRET) return null;
        const { rateLimit } = await import('./security');
        const email = credentials?.email?.trim().toLowerCase();
        if (
          !email ||
          email.length > 254 ||
          !credentials?.password ||
          Buffer.byteLength(credentials.password, 'utf8') > 72
        )
          return null;
        const rawIp = process.env.VERCEL
          ? request.headers?.['x-vercel-forwarded-for']
          : request.headers?.['x-forwarded-for'];
        const hashedIp = hashToken(`${process.env.NEXTAUTH_SECRET}:${rawIp || 'local'}`);
        try {
          await rateLimit(`login:ip:${hashedIp}`, 30, 900);
          await rateLimit(`login:email:${hashToken(email)}`, 10, 900);
        } catch {
          return null;
        }
        const admin = await db.admin.findUnique({ where: { email } });
        const passwordValid = await compare(
          credentials.password,
          admin?.passwordHash || '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
        );
        const valid = passwordValid && Boolean(admin?.enabled);
        await db.auditLog.create({
          data: {
            action: valid && admin ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
            actorId: valid ? admin?.id : undefined,
            ipHash: hashedIp,
          },
        });
        return valid && admin
          ? {
              id: admin.id,
              email: admin.email,
              name: admin.name,
              passwordVersion: passwordVersion(admin.passwordHash, process.env.NEXTAUTH_SECRET),
              sessionVersion: admin.sessionVersion,
            }
          : null;
      },
    }),
  ],
};
