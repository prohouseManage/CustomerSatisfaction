import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordVersion, passwordVersionMatches } from '../src/lib/auth-session';

test('sessions administrateur : une réinitialisation du mot de passe révoque les anciennes versions', () => {
  const before = passwordVersion('old-bcrypt-hash', 'test-secret');
  assert.equal(passwordVersionMatches(before, 'old-bcrypt-hash', 'test-secret'), true);
  assert.equal(passwordVersionMatches(before, 'new-bcrypt-hash', 'test-secret'), false);
  assert.equal(passwordVersionMatches(before, 'old-bcrypt-hash', 'rotated-secret'), false);
  for (const value of [undefined, null, '', 'invalid', 'a'.repeat(63), 'g'.repeat(64)])
    assert.equal(passwordVersionMatches(value, 'old-bcrypt-hash', 'test-secret'), false);
  assert.equal(before.includes('bcrypt'), false);
});
