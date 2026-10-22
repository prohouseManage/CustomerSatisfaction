import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  invitationSchema,
  acceptInvitationSchema,
  memberUpdateSchema,
} from '../src/lib/staff-policy';
import { collaborationEmail } from '../src/lib/collaboration-email';
test('collaboration : rôles explicites, e-mail normalisé, aucun champ supplémentaire accepté', () => {
  assert.deepEqual(invitationSchema.parse({ email: '  TEAM@EXAMPLE.ORG ' }), {
    email: 'team@example.org',
    name: '',
    role: 'MANAGER',
  });
  assert.equal(
    invitationSchema.safeParse({ email: 'a@example.org', role: 'OWNER' }).success,
    false,
  );
  assert.equal(memberUpdateSchema.safeParse({ passwordHash: 'x' }).success, false);
  assert.equal(memberUpdateSchema.safeParse({}).success, false);
  assert.equal(
    acceptInvitationSchema.safeParse({
      token: 'a'.repeat(43),
      name: 'Test',
      password: 'é'.repeat(40),
    }).success,
    false,
  );
});
test('invitation : e-mail échappé et lien personnel conservé dans le fragment', () => {
  const message = collaborationEmail({
    name: '<script>alert(1)</script>',
    role: 'MANAGER',
    url: 'https://survey.example.org/invitation#token=example',
    expiresAt: new Date('2026-12-11T10:00:00Z'),
  });
  assert.ok(!message.html.includes('<script>'));
  assert.ok(message.html.includes('&lt;script&gt;'));
  assert.ok(message.text.includes('/invitation#token=example'));
  assert.ok(message.text.includes('Manager'));
  assert.throws(() =>
    collaborationEmail({
      name: 'Test',
      role: 'ADMIN',
      url: 'javascript:alert(1)',
      expiresAt: new Date(),
    }),
  );
});
