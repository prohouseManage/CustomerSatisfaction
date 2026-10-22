import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesReportSession, parseReportFilters } from '../src/lib/report-filters';

test('rapports : les dates réelles et les bornes ordonnées sont validées côté serveur', () => {
  assert.deepEqual(
    parseReportFilters(new URLSearchParams('dateFrom=2028-02-29&dateTo=2028-02-29')),
    {
      sessionId: undefined,
      dateFrom: '2028-02-29',
      dateTo: '2028-02-29',
    },
  );
  for (const query of [
    'dateFrom=2026-02-29',
    'dateTo=2026-04-31',
    'dateFrom=22/10/2026',
    'dateFrom=2026-12-12&dateTo=2026-12-11',
    'dateFrom=0000-01-01',
  ])
    assert.throws(() => parseReportFilters(new URLSearchParams(query)));
  assert.doesNotThrow(() => parseReportFilters(new URLSearchParams('dateFrom=2026-01-01')));
  assert.doesNotThrow(() => parseReportFilters(new URLSearchParams('dateTo=2026-12-31')));
});

test('rapports : le jour demandé inclut les formations en cours et distingue les identifiants', () => {
  const filter = { dateFrom: '2026-10-22', dateTo: '2026-10-22' };
  const rows = [
    { id: 'start', date: '2026-10-22T00:00:00.000Z', endDate: '2026-10-25' },
    { id: 'end', date: '2026-10-19', endDate: '2026-10-22T00:00:00.000Z' },
    { id: 'spanning', date: '2026-10-20', endDate: '2026-10-24' },
    { id: 'legacy', date: '2026-10-22', endDate: null },
    { id: 'before', date: '2026-10-19', endDate: '2026-10-21' },
    { id: 'after', date: '2026-10-23', endDate: null },
  ];
  assert.deepEqual(
    rows.filter((row) => matchesReportSession(row, filter)).map((row) => row.id),
    ['start', 'end', 'spanning', 'legacy'],
  );
  assert.deepEqual(
    rows
      .filter((row) => matchesReportSession(row, { ...filter, sessionId: 'end' }))
      .map((row) => row.id),
    ['end'],
  );
});
