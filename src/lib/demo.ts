import { defaultQuestions } from './validation';
import type { SessionRecord, Stats, ParticipantRecord } from './types';
export const demoAllowed = () =>
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO === 'true';
export const demoSessions: SessionRecord[] = [
  {
    id: 'DORA-2026-001',
    name: 'DORA Foundation',
    date: '2026-12-11',
    trainer: 'Jean Dupont',
    description: 'Comprendre le cadre réglementaire de la résilience opérationnelle numérique.',
    status: 'ACTIVE',
    _count: { participants: 24, responses: 18 },
  },
  {
    id: 'LEAD-2026-008',
    name: 'Leadership & management d’équipe',
    date: '2026-10-19',
    trainer: 'Sophie Weber',
    description: 'Accompagner ses équipes et développer son leadership.',
    status: 'ACTIVE',
    _count: { participants: 18, responses: 16 },
  },
  {
    id: 'EXCEL-2026-012',
    name: 'Excel avancé : analyser ses données',
    date: '2026-10-16',
    trainer: 'Marc Schmit',
    description: 'Maîtriser les outils d’analyse et les tableaux croisés dynamiques.',
    status: 'ACTIVE',
    _count: { participants: 20, responses: 15 },
  },
  {
    id: 'AML-2026-004',
    name: 'Lutte contre le blanchiment : les essentiels',
    date: '2026-10-14',
    trainer: 'Anne Muller',
    description: 'Identifier les risques et les obligations en matière de conformité.',
    status: 'ARCHIVED',
    _count: { participants: 32, responses: 29 },
  },
  {
    id: 'PM-2026-009',
    name: 'Les fondamentaux de la gestion de projet',
    date: '2026-11-04',
    trainer: 'David Laurent',
    description: 'Les méthodes et outils pour piloter un projet.',
    status: 'DRAFT',
    _count: { participants: 16, responses: 0 },
  },
].map((s) => ({
  ...s,
  status: s.status as SessionRecord['status'],
  questions: defaultQuestions.map((q, i) => ({
    ...q,
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  })),
}));
export const demoStats: Stats = {
  sessions: 5,
  participants: 110,
  responses: 78,
  responseRate: (78 / 110) * 100,
  satisfaction: 3.7,
  pendingWebhooks: 0,
  activity: [
    { month: '2026-05', count: 8 },
    { month: '2026-06', count: 12 },
    { month: '2026-07', count: 9 },
    { month: '2026-08', count: 6 },
    { month: '2026-09', count: 19 },
    { month: '2026-10', count: 24 },
  ],
  results: defaultQuestions.slice(0, 3).map((q, i) => ({
    id: String(i),
    label: q.label,
    session: 'DORA Foundation',
    type: q.type,
    count: 18,
    average: [3.6, 3.8, 3.5][i],
    distribution: { '1': 0, '2': 1, '3': 4, '4': 13 },
    comments: [],
  })),
};
export const demoParticipants: ParticipantRecord[] = [
  {
    id: 'exemple-1',
    sessionId: 'DORA-2026-001',
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean@example.com',
    submittedAt: null,
    session: { name: 'DORA Foundation' },
  },
  {
    id: 'exemple-2',
    sessionId: 'DORA-2026-001',
    firstName: 'Marie',
    lastName: 'Martin',
    email: 'marie@example.com',
    submittedAt: '2026-10-21T09:00:00Z',
    session: { name: 'DORA Foundation' },
  },
  {
    id: 'exemple-3',
    sessionId: 'LEAD-2026-008',
    firstName: 'Lucas',
    lastName: 'Weber',
    email: 'lucas@example.com',
    submittedAt: '2026-10-20T10:00:00Z',
    session: { name: 'Leadership & management d’équipe' },
  },
];
