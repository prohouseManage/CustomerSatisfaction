import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveTimestamp,
  retentionDeadline,
  retentionSchema,
  deletionSchema,
} from '../src/lib/retention-policy';
test('Conservation : jours exacts, mois calendaires et années bissextiles sans débordement', () => {
  const deadline = (date: string, value: number, unit: 'DAYS' | 'MONTHS' | 'YEARS') =>
    retentionDeadline(new Date(date), { value, unit }).toISOString();
  assert.equal(deadline('2026-12-31T10:30:00Z', 2, 'DAYS'), '2027-01-02T10:30:00.000Z');
  assert.equal(deadline('2026-01-31T10:30:00Z', 1, 'MONTHS'), '2026-02-28T10:30:00.000Z');
  assert.equal(deadline('2024-01-31T10:30:00Z', 1, 'MONTHS'), '2024-02-29T10:30:00.000Z');
  assert.equal(deadline('2024-02-29T10:30:00Z', 1, 'YEARS'), '2025-02-28T10:30:00.000Z');
  assert.equal(deadline('2026-12-31T10:30:00Z', 2, 'MONTHS'), '2027-02-28T10:30:00.000Z');
});
test('Archivage : les modifications ne prolongent pas le délai, la réactivation l’annule', () => {
  const first = new Date('2026-10-01T09:00:00Z'),
    later = new Date('2026-10-22T09:00:00Z');
  assert.equal(archiveTimestamp('ACTIVE', null, 'ARCHIVED', first), first);
  assert.equal(archiveTimestamp('ARCHIVED', first, 'ARCHIVED', later), first);
  assert.equal(archiveTimestamp('ARCHIVED', first, 'ACTIVE', later), null);
  assert.equal(archiveTimestamp('ACTIVE', null, 'ARCHIVED', later), later);
});
test('Suppression : phrase exacte et règle de conservation validées côté serveur', () => {
  assert.ok(deletionSchema.safeParse({ confirmation: 'supprimer la session' }).success);
  for (const confirmation of ['', 'SUPPRIMER LA SESSION', 'session-id'])
    assert.equal(deletionSchema.safeParse({ confirmation }).success, false);
  for (const value of [0, -1, 1.5, 10001])
    assert.equal(
      retentionSchema.safeParse({ enabled: true, value, unit: 'MONTHS' }).success,
      false,
    );
  assert.equal(
    retentionSchema.safeParse({ enabled: true, value: 2, unit: 'WEEKS' }).success,
    false,
  );
});
