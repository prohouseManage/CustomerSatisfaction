import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { hash, compare } from 'bcryptjs';
import EmbeddedPostgres from 'embedded-postgres';
test(
  'Collaboration : invitations et autorisations sur PostgreSQL temporaire, aucun SMTP réel',
  { timeout: 120000 },
  async (t) => {
    const root = resolve('.test-postgres'),
      directory = resolve(root, randomUUID());
    assert.ok(directory.startsWith(root + sep));
    const password = randomBytes(24).toString('hex');
    const pg = new EmbeddedPostgres({
      databaseDir: directory,
      user: 'postgres',
      password,
      port: 55449,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      postgresFlags: ['-c', 'io_method=sync'],
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    let started = false;
    try {
      await pg.initialise();
      await pg.start();
      started = true;
      Object.assign(process.env, {
        DATABASE_URL: `postgresql://postgres:${password}@localhost:55449/postgres?connection_limit=8`,
        TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
        NEXTAUTH_SECRET: randomBytes(32).toString('hex'),
        NEXTAUTH_URL: 'https://survey.example.org',
        SMTP_HOST: 'smtp.eu.mailgun.org',
        SMTP_PORT: '587',
        SMTP_USER: 'postmaster@example.org',
        SMTP_PASSWORD: 'test-only-not-real',
        EMAIL_FROM: 'survey@example.org',
      });
      const client = pg.getPgClient('postgres', 'localhost');
      await client.connect();
      try {
        for (const dir of readdirSync(resolve('prisma/migrations'))
          .filter((n) => /^\d/.test(n))
          .sort())
          await client.query(
            readFileSync(resolve('prisma/migrations', dir, 'migration.sql'), 'utf8'),
          );
      } finally {
        await client.end();
      }
      const { db } = await import('../../src/lib/db');
      const {
        createStaffInvitation,
        deliverStaffInvitation,
        previewStaffInvitation,
        acceptStaffInvitation,
        resendStaffInvitation,
        revokeStaffInvitation,
        updateStaffMember,
        collaborationOverview,
      } = await import('../../src/lib/collaboration');
      const { decryptToken } = await import('../../src/lib/crypto');
      const { ApiError } = await import('../../src/lib/security');
      const { EmailSendError } = await import('../../src/lib/email-smtp');
      const actor = await db.admin.create({
        data: {
          email: 'admin@example.org',
          name: 'Admin',
          passwordHash: await hash('test-admin-password', 12),
        },
      });
      const invitationToken = async (id: string) =>
        decryptToken(
          (await db.staffInvitation.findUniqueOrThrow({ where: { id } })).tokenEncrypted,
        );
      const refusal = (status: number) => (error: unknown) =>
        error instanceof ApiError && error.status === status;
      try {
        let memberId = '';
        await t.test(
          'création sans compte prématuré, envoi unique malgré deux workers et aucun secret exposé',
          async () => {
            const invitation = await createStaffInvitation(
              actor.id,
              { email: 'Manager@Example.org', name: 'Manager Test' },
              'test',
            );
            assert.equal(await db.admin.count(), 1);
            assert.equal(invitation.role, 'MANAGER');
            const token = await invitationToken(invitation.id);
            const sent: string[] = [];
            await Promise.all([
              deliverStaffInvitation(invitation.id, async (message) => {
                sent.push(message.text);
              }),
              deliverStaffInvitation(invitation.id, async (message) => {
                sent.push(message.text);
              }),
            ]);
            assert.equal(sent.length, 1);
            assert.ok(sent[0].includes(`#token=${token}`));
            assert.equal(
              (await db.staffInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
                .deliveryStatus,
              'SENT',
            );
            const overview = JSON.stringify(await collaborationOverview());
            assert.ok(!overview.includes(token));
            assert.ok(!overview.includes('tokenEncrypted'));
            assert.ok(!overview.includes('passwordHash'));
            await previewStaffInvitation(token);
            await previewStaffInvitation(token);
            const results = await Promise.allSettled([
              acceptStaffInvitation(
                { token, name: 'Manager Test', password: 'my-test-password-123' },
                'test',
              ),
              acceptStaffInvitation(
                { token, name: 'Manager Test', password: 'my-test-password-123' },
                'test',
              ),
            ]);
            assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
            const member = await db.admin.findUniqueOrThrow({
              where: { email: 'manager@example.org' },
            });
            memberId = member.id;
            assert.equal(member.role, 'MANAGER');
            assert.equal(await compare('my-test-password-123', member.passwordHash), true);
            await assert.rejects(previewStaffInvitation(token), refusal(410));
          },
        );
        await t.test(
          'manager sans droit de gestion des comptes, promotion et désactivation révoquent les connexions',
          async () => {
            await assert.rejects(
              createStaffInvitation(memberId, { email: 'forbidden@example.org' }, 'test'),
              refusal(403),
            );
            await assert.rejects(
              updateStaffMember(memberId, actor.id, { role: 'MANAGER' }, 'test'),
              refusal(403),
            );
            await assert.rejects(
              updateStaffMember(actor.id, actor.id, { enabled: false }, 'test'),
              refusal(409),
            );
            await updateStaffMember(actor.id, memberId, { role: 'ADMIN' }, 'test');
            assert.equal(
              (await db.admin.findUniqueOrThrow({ where: { id: memberId } })).sessionVersion,
              1,
            );
            const delegated = await createStaffInvitation(
              memberId,
              { email: 'delegated@example.org' },
              'test',
            );
            const delegatedToken = await invitationToken(delegated.id);
            await updateStaffMember(actor.id, memberId, { enabled: false }, 'test');
            await assert.rejects(
              createStaffInvitation(memberId, { email: 'disabled@example.org' }, 'test'),
              refusal(403),
            );
            await updateStaffMember(actor.id, memberId, { enabled: true, role: 'MANAGER' }, 'test');
            await assert.rejects(previewStaffInvitation(delegatedToken), refusal(410));
            assert.equal(
              (await db.admin.findUniqueOrThrow({ where: { id: memberId } })).sessionVersion,
              3,
            );
          },
        );
        await t.test('expiration, révocation et renvoi invalident les anciens liens', async () => {
          const invitation = await createStaffInvitation(
            actor.id,
            { email: 'resend@example.org' },
            'test',
          );
          const oldToken = await invitationToken(invitation.id);
          await assert.rejects(
            resendStaffInvitation(actor.id, invitation.id, 'test'),
            refusal(429),
          );
          await db.staffInvitation.update({
            where: { id: invitation.id },
            data: { expiresAt: new Date(0), updatedAt: new Date(0) },
          });
          await assert.rejects(previewStaffInvitation(oldToken), refusal(410));
          await resendStaffInvitation(actor.id, invitation.id, 'test');
          const token = await invitationToken(invitation.id);
          assert.notEqual(token, oldToken);
          await assert.rejects(previewStaffInvitation(oldToken), refusal(410));
          await previewStaffInvitation(token);
          await revokeStaffInvitation(actor.id, invitation.id, 'test');
          await assert.rejects(
            acceptStaffInvitation({ token, name: 'Test', password: 'my-test-password' }, 'test'),
            refusal(410),
          );
          assert.equal(await db.admin.count({ where: { email: invitation.email } }), 0);
        });
        await t.test(
          'échec et incertitude SMTP sans renvoi automatique ; invitation d’un administrateur désactivé refusée',
          async () => {
            for (const uncertain of [false, true]) {
              const invitation = await createStaffInvitation(
                actor.id,
                { email: `failure${uncertain}@example.org` },
                'test',
              );
              let calls = 0;
              const transport = async () => {
                calls++;
                throw new EmailSendError(uncertain);
              };
              await deliverStaffInvitation(invitation.id, transport);
              await deliverStaffInvitation(invitation.id, transport);
              assert.equal(calls, 1);
              assert.equal(
                (await db.staffInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
                  .deliveryStatus,
                uncertain ? 'UNKNOWN' : 'FAILED',
              );
            }
            const invitation = await createStaffInvitation(
              actor.id,
              { email: 'old-inviter@example.org' },
              'test',
            );
            const token = await invitationToken(invitation.id);
            await db.admin.update({ where: { id: actor.id }, data: { enabled: false } });
            await assert.rejects(previewStaffInvitation(token), refusal(410));
          },
        );
      } finally {
        await db.$disconnect();
      }
    } finally {
      if (started) await pg.stop();
    }
  },
);
