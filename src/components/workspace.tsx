'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import Brand from './brand';
import Dialog from './dialog';
import SessionEditor from './session-editor';
import PdfTemplates, { SessionPdfPanel } from './pdf-templates';
import OdooPanel from './odoo-panel';
import AutomationMonitor from './automation-monitor';
import { RefreshCw } from 'lucide-react';
import RetentionSettingsPanel from './retention-settings';
import { EmailSettingsPanel, SessionEmailPanel, ManualEmailDialog } from './email-controls';
import EmailHistoryDialog, { ParticipantEmailCell } from './email-history';
import { sessionDateRange } from '@/lib/session-dates';
import { deletionPhrase } from '@/lib/retention-policy';
import EmailReactivationDialog from './email-reactivation';
import type { EmailReactivation } from '@/lib/email-policy';
import SessionOverview from './session-overview';
import { ReportControls, ReportSessionList } from './report-controls';
import { matchesReportSession, type ReportFilters } from '@/lib/report-filters';
import { demoParticipants, demoSessions, demoStats } from '@/lib/demo';
import type { ParticipantRecord, SessionRecord, Stats } from '@/lib/types';
import { typeLabels } from '@/lib/validation';

const statusLabels = { ACTIVE: 'Active', DRAFT: 'Brouillon', ARCHIVED: 'Archivée' };
const views: Record<string, string> = {
  dashboard: 'Tableau de bord',
  sessions: 'Sessions de formation',
  participants: 'Participants',
  reports: 'Rapports & analyses',
  templates: 'Modèles PDF',
  integrations: 'Intégrations',
  automations: 'Automatisations',
  settings: 'Paramètres',
};
const fmt = (value: number) => new Intl.NumberFormat('fr-LU').format(value);
const dateFmt = (value: string) =>
  new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Luxembourg',
  });
const percent = (value: number) =>
  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b.error || 'Le service est indisponible.');
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
const emptyStats: Stats = {
  sessions: 0,
  participants: 0,
  responses: 0,
  responseRate: 0,
  satisfaction: null,
  pendingWebhooks: 0,
  activity: [],
  results: [],
};
type Config = {
  database: boolean;
  webhook: boolean;
  encryption: boolean;
  https: boolean;
  failed: number;
  pending: number;
  delivered: number;
};
type ResponseRecord = {
  id: string;
  sessionId: string;
  submittedAt: string;
  participant: { firstName: string; lastName: string };
  session: { name: string };
};
export default function Workspace({
  demo,
  name,
  initialView,
  initialSession,
}: {
  demo: boolean;
  name: string;
  initialView?: string;
  initialSession?: string;
}) {
  const [view, setView] = useState(initialView && views[initialView] ? initialView : 'dashboard');
  const [sessions, setSessions] = useState<SessionRecord[]>(demo ? demoSessions : []),
    [stats, setStats] = useState<Stats>(demo ? demoStats : emptyStats);
  const [participants, setParticipants] = useState<ParticipantRecord[]>(
      demo ? demoParticipants : [],
    ),
    [total, setTotal] = useState(demo ? demoParticipants.length : 0),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState(initialSession || ''),
    [tab, setTab] = useState('participants'),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('ALL');
  const [busy, setBusy] = useState(!demo),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<SessionRecord | 'new' | null>(null),
    [importOpen, setImportOpen] = useState(false),
    [demoNotice, setDemoNotice] = useState(false),
    [deleteSession, setDeleteSession] = useState<SessionRecord | null>(null),
    [qr, setQr] = useState<{ link: string; qrCode: string } | null>(null);
  const [config, setConfig] = useState<Config | null>(null),
    [recent, setRecent] = useState<ResponseRecord[]>([]),
    [reportStats, setReportStats] = useState<Stats | null>(null);
  const [reportFilters, setReportFilters] = useState<ReportFilters>({});
  const reportQuery = new URLSearchParams(
    Object.entries(reportFilters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  const reportFilterInvalid = Boolean(
    reportFilters.dateFrom && reportFilters.dateTo && reportFilters.dateFrom > reportFilters.dateTo,
  );
  const reportSessions = sessions.filter((session) => matchesReportSession(session, reportFilters));
  const demoReportParticipants = reportSessions.reduce(
    (sum, session) => sum + session._count.participants,
    0,
  );
  const demoReportResponses = reportSessions.reduce(
    (sum, session) => sum + session._count.responses,
    0,
  );
  const displayedReportStats: Stats | null = demo
    ? {
        ...demoStats,
        sessions: reportSessions.length,
        participants: demoReportParticipants,
        responses: demoReportResponses,
        responseRate: demoReportParticipants
          ? (demoReportResponses / demoReportParticipants) * 100
          : 0,
        results: demoStats.results.filter((question) =>
          reportSessions.some((session) => session.name === question.session),
        ),
      }
    : reportStats;
  const [emailTarget, setEmailTarget] = useState<ParticipantRecord | null>(null);
  const [emailHistoryTarget, setEmailHistoryTarget] = useState<ParticipantRecord | null>(null);
  const [participantRefresh, setParticipantRefresh] = useState(0);
  const refreshParticipantEmails = useCallback(() => setParticipantRefresh((n) => n + 1), []);
  const emailsInProgress = participants.some((p) =>
    ['PENDING', 'SENDING'].includes(p.emailSummary?.latest?.status || ''),
  );
  const [reactivateSession, setReactivateSession] = useState<SessionRecord | null>(null);
  const [emailRefresh, setEmailRefresh] = useState(0);
  const base = demo ? '/demo' : '/admin';
  const current = view === 'sessions' ? sessions.find((s) => s.id === selected) : undefined;
  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    if (demo) return;
    let live = true;
    setBusy(true);
    setError('');
    Promise.all([json<SessionRecord[]>('/api/sessions'), json<Stats>('/api/statistics')])
      .then(([s, t]) => {
        if (live) {
          setSessions(s);
          setStats(t);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [demo, refresh]);
  useEffect(() => {
    if (demo) return;
    let live = true;
    if (view === 'participants' || selected) {
      const load = () =>
        json<{ items: ParticipantRecord[]; total: number }>(
          `/api/participants?page=${page}${selected ? `&sessionId=${encodeURIComponent(selected)}` : ''}`,
        )
          .then((p) => {
            if (live) {
              setParticipants(p.items);
              setTotal(p.total);
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          });
      void load();
      const timer = emailsInProgress ? setInterval(() => void load(), 10000) : undefined;
      return () => {
        live = false;
        if (timer) clearInterval(timer);
      };
    }
    return () => {
      live = false;
    };
  }, [demo, view, selected, page, refresh, emailRefresh, participantRefresh, emailsInProgress]);
  useEffect(() => {
    if (demo || !['integrations', 'settings'].includes(view)) return;
    json<Config>('/api/integrations')
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [demo, view, refresh]);
  useEffect(() => {
    if (demo || view !== 'reports' || reportFilterInvalid) return;
    let live = true;
    setReportStats(null);
    setRecent([]);
    setError('');
    Promise.all([
      json<Stats>(`/api/statistics?${reportQuery}`),
      json<{ items: ResponseRecord[] }>(`/api/responses?${reportQuery}`),
    ])
      .then(([s, r]) => {
        if (live) {
          setReportStats(s);
          setRecent(r.items);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [demo, view, reportQuery, reportFilterInvalid, refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  function go(next: string) {
    setView(next);
    setSelected('');
    setPage(1);
    setQuery('');
    setFilter('ALL');
    setMobile(false);
    setError('');
    window.history.replaceState(null, '', `${base}?view=${next}`);
  }
  function open(s: SessionRecord) {
    setView('sessions');
    setSelected(s.id);
    setTab('participants');
    setPage(1);
    setQuery('');
    setError('');
    window.history.replaceState(null, '', `${base}?view=sessions&session=${s.id}`);
  }
  function authorized(action: () => void) {
    if (demo) setDemoNotice(true);
    else action();
  }
  async function download(url: string) {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        const b = await r.json();
        throw new Error(b.error);
      }
      const blob = await r.blob(),
        a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download =
        r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'export';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export impossible.');
    }
  }
  async function archive(s: SessionRecord, emailReactivation?: EmailReactivation) {
    if (s.status === 'ARCHIVED' && !emailReactivation) {
      setReactivateSession(s);
      return;
    }
    try {
      await json(`/api/sessions/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: s.id,
          name: s.name,
          trainer: s.trainer,
          description: s.description,
          date: s.date.slice(0, 10),
          endDate: (s.endDate || s.date).slice(0, 10),
          status: s.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED',
          ...(emailReactivation && { emailReactivation }),
          questions: s.questions.map(({ label, type, required, options }) => ({
            label,
            type,
            required,
            options,
          })),
        }),
      });
      setToast(
        s.status === 'ARCHIVED'
          ? emailReactivation?.action === 'RESCHEDULE'
            ? 'Session réactivée. Les e-mails non envoyés ont été reprogrammés.'
            : 'Session réactivée. Les e-mails restent suspendus.'
          : 'Session archivée. Les liens sont fermés et les e-mails non envoyés sont suspendus.',
      );
      setEmailRefresh((n) => n + 1);
      reload();
    } catch (e) {
      if (emailReactivation) throw e;
      setError(e instanceof Error ? e.message : 'Action impossible.');
    }
  }
  const shownSessions = sessions.filter(
    (s) =>
      (filter === 'ALL' || s.status === filter) &&
      `${s.name} ${s.id} ${s.trainer}`.toLowerCase().includes(query.toLowerCase()),
  );
  const shownParticipants = participants.filter(
    (p) =>
      (!demo || !selected || p.sessionId === selected) &&
      `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'ALL' || (filter === 'DONE' ? !!p.submittedAt : !p.submittedAt)),
  );
  const nav = [
    { id: 'dashboard', icon: LayoutDashboard },
    { id: 'sessions', icon: CalendarDays },
    { id: 'participants', icon: Users },
    { id: 'reports', icon: BarChart3 },
  ];
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Fermer la navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
        <Link href={base} className="brand-link">
          <Brand />
        </Link>
        <div className="workspace-label">
          <span className="workspace-dot" />
          ÉCOUTE<span className="workspace-version">ESPACE QUALITÉ</span>
        </div>
        <div className="nav-label">PILOTAGE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{views[n.id]}</span>
              {n.id === 'sessions' && <span className="nav-count">{sessions.length}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label tools-label">VOTRE ESPACE</div>
        <nav>
          <button
            className={`nav-item ${view === 'templates' ? 'active' : ''}`}
            onClick={() => go('templates')}
          >
            <FileText size={19} />
            Modèles PDF
          </button>
          <button
            className={`nav-item ${view === 'integrations' ? 'active' : ''}`}
            onClick={() => go('integrations')}
          >
            <Link2 size={19} />
            Intégrations<span className="new-badge">API</span>
          </button>
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => go('settings')}
          >
            <Settings2 size={19} />
            Paramètres
          </button>
          <button
            className={`nav-item ${view === 'automations' ? 'active' : ''}`}
            onClick={() => go('automations')}
          >
            <RefreshCw size={19} />
            Automatisations
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-card-icon">
              <Sparkles size={19} />
            </div>
            <strong>
              La qualité commence
              <br />
              par l’écoute.
            </strong>
            <p>Transformez chaque retour en une meilleure expérience.</p>
            <Link href="/docs">
              Guide & documentation
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="profile">
            <div className="avatar">
              {name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <strong>{name}</strong>
              <small>Administrateur{demo ? ' · Aperçu' : ''}</small>
            </div>
            <button
              className="icon-btn"
              aria-label={demo ? 'Aller à la connexion' : 'Se déconnecter'}
              onClick={() =>
                demo ? window.location.assign('/login') : signOut({ callbackUrl: '/login' })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Ouvrir la navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Enquêtes de satisfaction</span>
            <ChevronRight size={14} />
            <strong>{current ? current.id : views[view]}</strong>
          </div>
          <div className="topbar-right">
            <span className="admin-pill">
              <span /> Espace administrateur
            </span>
            <Link className="icon-btn" href="/docs" aria-label="Documentation et aide">
              <CircleHelp size={19} />
            </Link>
            <span className="topbar-divider" />
            <div className="avatar small">
              {name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </div>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <BookOpen size={15} />
              <strong>Mode aperçu</strong>
              <span> — Données d’exemple · aucune donnée réelle n’est enregistrée</span>
            </span>
            <Link href="/login">
              Connecter mon espace
              <ArrowRight size={14} />
            </Link>
          </div>
        )}
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {current
                  ? 'SESSION DE FORMATION'
                  : view === 'dashboard'
                    ? 'VOTRE ESPACE QUALITÉ'
                    : 'ENQUÊTES DE SATISFACTION'}
              </div>
              <h1>
                {current ? current.name : views[view]}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {current ? (
                  <>
                    {current.id}
                    <span className="inline-dot">·</span>
                    {sessionDateRange(current.date, current.endDate)}
                    <span className="inline-dot">·</span>
                    {current.trainer}
                  </>
                ) : view === 'dashboard' ? (
                  'Une vue d’ensemble pour faire progresser vos formations.'
                ) : view === 'sessions' ? (
                  'Créez, partagez et suivez vos enquêtes de formation.'
                ) : view === 'participants' ? (
                  'Retrouvez vos participants et suivez leurs réponses.'
                ) : view === 'reports' ? (
                  'Des retours concrets pour éclairer vos prochaines décisions.'
                ) : view === 'integrations' ? (
                  'Reliez les retours de vos participants à vos outils.'
                ) : view === 'templates' ? (
                  'Créez et réutilisez vos invitations aux enquêtes de satisfaction.'
                ) : (
                  'Les informations et la configuration de votre espace.'
                )}
              </p>
            </div>
            <div className="heading-actions">
              {current ? (
                <>
                  <button
                    className="btn secondary"
                    onClick={() => authorized(() => setEditor(current))}
                  >
                    <Pencil size={16} />
                    Modifier
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => authorized(() => setImportOpen(true))}
                  >
                    <Upload size={16} />
                    Importer des participants
                  </button>
                </>
              ) : ['dashboard', 'sessions'].includes(view) ? (
                <button className="btn primary" onClick={() => authorized(() => setEditor('new'))}>
                  <Plus size={18} />
                  Nouvelle session
                </button>
              ) : view === 'participants' ? (
                <button
                  className="btn primary"
                  onClick={() => authorized(() => setImportOpen(true))}
                >
                  <Upload size={17} />
                  Importer des participants
                </button>
              ) : null}
            </div>
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
              <button
                className="text-link"
                onClick={() => {
                  setError('');
                  reload();
                }}
              >
                Réessayer
              </button>
            </div>
          )}
          {busy ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Chargement de votre espace…
            </div>
          ) : (
            <>
              {view === 'dashboard' && (
                <>
                  <Metrics stats={stats} />
                  <div className="dashboard-charts">
                    <ActivityChart stats={stats} />
                    <Satisfaction stats={stats} />
                  </div>
                  <section className="panel sessions-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Vos sessions de formation
                          <span className="count-pill">{sessions.length}</span>
                        </h2>
                        <p>Suivez la participation en un coup d’œil.</p>
                      </div>
                      <button className="text-link" onClick={() => go('sessions')}>
                        Toutes les sessions
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <SessionTable sessions={sessions.slice(0, 4)} onOpen={open} />
                  </section>
                  <div className="bottom-note">
                    <ShieldCheck size={16} />
                    <span>
                      Un lien personnel. Une seule réponse. Des retours en toute confiance.
                    </span>
                    <span>
                      Conçu pour faire grandir les compétences
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </>
              )}
              {view === 'sessions' && !current && (
                <>
                  <div className="session-summary">
                    <div>
                      <CalendarDays size={19} />
                      <strong>{sessions.length}</strong>
                      <span>sessions au total</span>
                    </div>
                    <div>
                      <span className="status-dot active" />
                      <strong>{sessions.filter((s) => s.status === 'ACTIVE').length}</strong>
                      <span>actives</span>
                    </div>
                    <div>
                      <span className="status-dot draft" />
                      <strong>{sessions.filter((s) => s.status === 'DRAFT').length}</strong>
                      <span>brouillons</span>
                    </div>
                    <div>
                      <span className="status-dot archived" />
                      <strong>{sessions.filter((s) => s.status === 'ARCHIVED').length}</strong>
                      <span>archivées</span>
                    </div>
                  </div>
                  <section className="panel">
                    <Toolbar
                      query={query}
                      setQuery={setQuery}
                      placeholder="Rechercher une formation, un formateur…"
                    >
                      <select
                        aria-label="Filtrer par statut"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="ALL">Tous les statuts</option>
                        <option value="ACTIVE">Actives</option>
                        <option value="DRAFT">Brouillons</option>
                        <option value="ARCHIVED">Archivées</option>
                      </select>
                    </Toolbar>
                    <SessionTable sessions={shownSessions} onOpen={open} />
                    <div className="table-footer">
                      {shownSessions.length} session{shownSessions.length > 1 ? 's' : ''} affichée
                      {shownSessions.length > 1 ? 's' : ''}
                    </div>
                  </section>
                </>
              )}
              {view === 'sessions' && current && (
                <>
                  <button className="back-link" onClick={() => go('sessions')}>
                    <ChevronLeft size={16} />
                    Retour aux sessions
                  </button>
                  <div className="session-detail-grid">
                    <SessionOverview
                      session={current}
                      onEdit={() => authorized(() => setEditor(current))}
                    />
                    <div className="panel share-panel">
                      <SessionPdfPanel
                        key={current.id}
                        session={current}
                        demo={demo}
                        onDemo={() => setDemoNotice(true)}
                        onSaved={(updated) =>
                          setSessions((items) =>
                            items.map((s) => (s.id === updated.id ? updated : s)),
                          )
                        }
                        onExcel={() =>
                          authorized(() =>
                            download(`/api/sessions/${current.id}/export?format=xlsx`),
                          )
                        }
                      />
                    </div>
                  </div>
                  {!demo && (
                    <SessionEmailPanel
                      key={`${current.id}:${emailRefresh}`}
                      sessionId={current.id}
                      sessionName={current.name}
                      onConfigure={() => setEditor(current)}
                      onTrackingChanged={refreshParticipantEmails}
                    />
                  )}
                  {!demo && (
                    <OdooPanel
                      key={current.id}
                      sessionId={current.id}
                      sessionName={current.name}
                      onConfigure={() => setEditor(current)}
                    />
                  )}
                  <section className="panel">
                    <div className="tabs">
                      {[
                        ['participants', 'Participants'],
                        ['questions', 'Questionnaire'],
                        ['results', 'Résultats'],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={tab === id ? 'active' : ''}
                          onClick={() => {
                            setTab(id);
                            if (id === 'results') {
                              setReportFilters({ sessionId: current.id });
                              setView('reports');
                            }
                          }}
                        >
                          {label}
                          {id === 'participants' && <span>{current._count.participants}</span>}
                        </button>
                      ))}
                    </div>
                    {tab === 'participants' ? (
                      <>
                        <Toolbar
                          query={query}
                          setQuery={setQuery}
                          placeholder="Rechercher un participant…"
                        >
                          <select
                            aria-label="Filtrer les réponses"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          >
                            <option value="ALL">Tous les participants</option>
                            <option value="DONE">Répondu</option>
                            <option value="WAITING">En attente</option>
                          </select>
                        </Toolbar>
                        <ParticipantTable
                          participants={shownParticipants}
                          onHistory={(p) => authorized(() => setEmailHistoryTarget(p))}
                          onEmail={(p) => authorized(() => setEmailTarget(p))}
                          onLink={(p) =>
                            authorized(async () => {
                              try {
                                setQr(await json(`/api/participants/${p.id}/link`));
                              } catch (e) {
                                setError(e instanceof Error ? e.message : 'Lien indisponible.');
                              }
                            })
                          }
                        />
                        <Pagination page={page} total={total} onPage={setPage} />
                      </>
                    ) : (
                      <div className="question-preview-list">
                        {current.questions.map((q, i) => (
                          <div className="question-preview" key={q.id}>
                            <span>{String(i + 1).padStart(2, '0')}</span>
                            <div>
                              <strong>{q.label}</strong>
                              <p>
                                {typeLabels[q.type]}
                                <span className="inline-dot">·</span>
                                {q.required ? 'Obligatoire' : 'Facultatif'}
                              </p>
                              {q.options.length > 0 && <small>{q.options.join(' · ')}</small>}
                            </div>
                          </div>
                        ))}
                        <div className="notice">
                          <ShieldCheck size={17} />
                          Les données d’identité du participant sont affichées en lecture seule.
                        </div>
                      </div>
                    )}
                  </section>
                  <div className="session-bottom-actions">
                    <Link
                      className="text-link"
                      href={demo ? '/demo/form' : `/admin/sessions/${current.id}/preview`}
                      target="_blank"
                    >
                      Prévisualiser le questionnaire
                      <ExternalLink size={15} />
                    </Link>
                    <div>
                      <button
                        className="btn secondary"
                        onClick={() => authorized(() => archive(current))}
                      >
                        <Archive size={16} />
                        {current.status === 'ARCHIVED' ? 'Réactiver' : 'Archiver'} la session
                      </button>
                    </div>
                  </div>
                  {current.status === 'ARCHIVED' && (
                    <section
                      className="panel danger-zone"
                      aria-label="Zone de suppression définitive"
                    >
                      <div>
                        <h3>Zone rouge · Suppression définitive</h3>
                        <p>
                          Supprimez cette session archivée et toutes ses données dans l’application
                          : participants, réponses, commentaires et liens.
                        </p>
                        {current.archivedAt && (
                          <p className="subtle">
                            Archivée le {dateFmt(current.archivedAt)}. Le délai de suppression
                            automatique se règle dans les paramètres.
                          </p>
                        )}
                      </div>
                      <button
                        className="btn danger"
                        onClick={() => authorized(() => setDeleteSession(current))}
                      >
                        <Trash2 size={16} /> Supprimer la session
                      </button>
                    </section>
                  )}
                </>
              )}
              {view === 'sessions' && selected && !current && (
                <Empty
                  title="Session introuvable"
                  text="Revenez à la liste pour sélectionner une session."
                />
              )}
              {view === 'participants' && (
                <section className="panel">
                  <Toolbar
                    query={query}
                    setQuery={setQuery}
                    placeholder="Rechercher un nom ou un e-mail…"
                  >
                    <select
                      aria-label="Session"
                      value={selected}
                      onChange={(e) => {
                        setSelected(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Toutes les sessions</option>
                      {sessions.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Statut de réponse"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="ALL">Tous les statuts</option>
                      <option value="DONE">Répondu</option>
                      <option value="WAITING">En attente</option>
                    </select>
                  </Toolbar>
                  <ParticipantTable
                    participants={shownParticipants}
                    onHistory={(p) => authorized(() => setEmailHistoryTarget(p))}
                    onLink={(p) =>
                      authorized(async () => {
                        try {
                          setQr(await json(`/api/participants/${p.id}/link`));
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Lien indisponible.');
                        }
                      })
                    }
                  />
                  <Pagination page={page} total={total} onPage={setPage} />
                </section>
              )}
              {view === 'reports' && (
                <>
                  <ReportControls
                    sessions={sessions}
                    filters={reportFilters}
                    onChange={setReportFilters}
                    exportDisabled={
                      reportFilterInvalid || !reportSessions.length || !displayedReportStats
                    }
                    onExport={(format) =>
                      authorized(() => download(`/api/exports?format=${format}&${reportQuery}`))
                    }
                  />
                  {reportFilterInvalid ? (
                    <p className="error-box" role="alert">
                      La date de fin doit être égale ou postérieure à la date de début.
                    </p>
                  ) : displayedReportStats ? (
                    <>
                      <Metrics stats={displayedReportStats} />
                      <ReportSessionList sessions={reportSessions} onOpen={open} />
                      <div className="section-heading">
                        <h2>Résultats par question</h2>
                        <span className="subtle">
                          Satisfaction sur 4 étoiles. Les anciennes notes sont normalisées sur 4.
                        </span>
                      </div>
                      <div className="report-grid">
                        {displayedReportStats.results.map((q, i) => (
                          <div className="panel question-report" key={q.id}>
                            <span className="eyebrow">
                              QUESTION {String(i + 1).padStart(2, '0')}
                              <span>
                                {q.count} réponse{q.count > 1 ? 's' : ''}
                              </span>
                            </span>
                            <h3>{q.label}</h3>
                            <small className="muted">
                              {q.session}
                              {q.sessionId ? ` · ${q.sessionId}` : ''}
                            </small>
                            {q.archived && (
                              <span className="status archived">Ancien questionnaire</span>
                            )}
                            {q.average !== null && (
                              <div className="question-average">
                                {q.average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                                <span>
                                  {q.type === 'RATING_4'
                                    ? '/ 4'
                                    : q.type === 'RATING_5'
                                      ? '/ 5'
                                      : q.type === 'RATING_10'
                                        ? '/ 10'
                                        : 'moyenne'}
                                </span>
                                {q.type.startsWith('RATING') && (
                                  <Star size={22} fill="currentColor" />
                                )}
                              </div>
                            )}
                            <div className="distribution">
                              {Object.entries(q.distribution).map(([key, count]) => (
                                <div key={key}>
                                  <span>{key}</span>
                                  <div>
                                    <i
                                      style={{ width: `${q.count ? (count / q.count) * 100 : 0}%` }}
                                    />
                                  </div>
                                  <strong>{count}</strong>
                                </div>
                              ))}
                            </div>
                            {q.comments.map((c, i) => (
                              <blockquote key={i}>{c}</blockquote>
                            ))}
                            {q.count === 0 && (
                              <p className="muted">
                                Les résultats apparaîtront après les premières réponses.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      {!displayedReportStats.results.length && (
                        <Empty
                          title={
                            reportSessions.length
                              ? 'Les retours arrivent bientôt'
                              : 'Aucune session dans ce périmètre'
                          }
                          text={
                            reportSessions.length
                              ? 'Les résultats apparaîtront après les premières réponses.'
                              : 'Modifiez la date ou la période pour retrouver vos sessions.'
                          }
                        />
                      )}
                      {!demo && recent.length > 0 && (
                        <section className="panel">
                          <div className="panel-heading">
                            <div>
                              <h2>Dernières réponses</h2>
                              <p>Les 100 réponses les plus récentes du périmètre sélectionné.</p>
                            </div>
                          </div>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Participant</th>
                                  <th>Formation</th>
                                  <th>Date de soumission</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recent.map((r) => (
                                  <tr key={r.id}>
                                    <td>
                                      {r.participant.firstName} {r.participant.lastName}
                                    </td>
                                    <td>
                                      {r.session.name}
                                      <span className="report-response-id">{r.sessionId}</span>
                                    </td>
                                    <td>{dateFmt(r.submittedAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      )}
                    </>
                  ) : (
                    <div className="loading-state">
                      <LoaderCircle className="spin" />
                      Calcul des résultats…
                    </div>
                  )}
                </>
              )}
              {view === 'integrations' && (
                <>
                  <div className="integration-hero">
                    <div className="integration-art">
                      <span>
                        <MessageSquareText size={30} />
                      </span>
                      <i />
                      <span>
                        <Send size={28} />
                      </span>
                      <i />
                      <span>
                        <FolderOpen size={30} />
                      </span>
                    </div>
                    <h2>Vos réponses, au bon endroit.</h2>
                    <p>
                      À chaque soumission, l’application transmet les réponses à votre flux Power
                      Automate.
                      <br />
                      Connectez SharePoint, Outlook, Power BI ou Odoo depuis votre flux.
                    </p>
                  </div>
                  <div className="integration-grid">
                    <div className="panel integration-card">
                      <div className="integration-logo">
                        <Send size={24} />
                      </div>
                      <div className="section-heading">
                        <h2>Power Automate</h2>
                        <span className={`status ${config?.webhook ? 'active' : 'draft'}`}>
                          <i />
                          {config?.delivered
                            ? 'Envois confirmés'
                            : config?.webhook
                              ? 'URL renseignée'
                              : 'À configurer'}
                        </span>
                      </div>
                      <p className="muted">
                        Renseignez l’URL de votre flux HTTP dans la variable d’environnement{' '}
                        <code>POWER_AUTOMATE_WEBHOOK_URL</code>.
                      </p>
                      <div className="integration-files">
                        <button
                          className="btn secondary full"
                          onClick={() =>
                            authorized(() =>
                              download('/api/integrations/powerautomate?format=schema'),
                            )
                          }
                        >
                          <Download size={16} />
                          Schéma du déclencheur HTTP
                        </button>
                        <button
                          className="btn secondary full"
                          onClick={() =>
                            authorized(() =>
                              download('/api/integrations/powerautomate?format=example'),
                            )
                          }
                        >
                          <FileText size={16} />
                          Exemple JSON de test
                        </button>
                      </div>
                      <div className="integration-numbers">
                        <div>
                          <strong>{config?.delivered ?? '—'}</strong>
                          <span>Livrés</span>
                        </div>
                        <div>
                          <strong>{config?.pending ?? '—'}</strong>
                          <span>En attente</span>
                        </div>
                        <div>
                          <strong>{config?.failed ?? '—'}</strong>
                          <span>À réessayer</span>
                        </div>
                      </div>
                      <button
                        className="btn secondary full"
                        onClick={() =>
                          authorized(async () => {
                            try {
                              await json('/api/integrations', { method: 'POST' });
                              setToast('La reprise des envois a été exécutée.');
                              reload();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Reprise impossible.');
                            }
                          })
                        }
                      >
                        <Send size={16} />
                        Réessayer les 5 prochains envois
                      </button>
                    </div>
                    <div className="panel integration-card">
                      <div className="integration-logo pink-bg">
                        <Link2 size={24} />
                      </div>
                      <h2>API REST & webhooks</h2>
                      <p className="muted">
                        Une API documentée pour connecter vos outils, avec validation serveur et
                        authentification.
                      </p>
                      <div className="endpoint">
                        <span>POST</span>
                        <code>/api/webhook/powerautomate</code>
                      </div>
                      <p className="subtle">
                        Réception sécurisée des événements Power Automate. La transmission des
                        réponses utilise l’URL de votre flux.
                      </p>
                      <Link href="/docs" className="btn secondary full">
                        <BookOpen size={16} />
                        Consulter la documentation
                        <ArrowUpRight size={16} />
                      </Link>
                    </div>
                  </div>
                </>
              )}
              {view === 'automations' && <AutomationMonitor demo={demo} />}
              {view === 'templates' && (
                <PdfTemplates demo={demo} onDemo={() => setDemoNotice(true)} />
              )}
              {view === 'settings' && (
                <div className="settings-grid">
                  <EmailSettingsPanel demo={demo} onDemo={() => setDemoNotice(true)} />
                  <RetentionSettingsPanel demo={demo} onDemo={() => setDemoNotice(true)} />
                  <section className="panel settings-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Votre compte</h2>
                        <p>Un espace réservé aux administrateurs.</p>
                      </div>
                      <ShieldCheck size={22} />
                    </div>
                    <div className="settings-row">
                      <span>Nom</span>
                      <strong>{name}</strong>
                    </div>
                    <div className="settings-row">
                      <span>Rôle</span>
                      <strong>Administrateur</strong>
                    </div>
                    <div className="settings-row">
                      <span>Durée de connexion</span>
                      <strong>8 heures</strong>
                    </div>
                    <div className="settings-row">
                      <span>Gestion des comptes</span>
                      <code>npm run db:admin</code>
                    </div>
                  </section>
                  <section className="panel settings-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Configuration technique</h2>
                        <p>Les secrets sont définis dans l’environnement de déploiement.</p>
                      </div>
                      <Settings2 size={22} />
                    </div>
                    {[
                      ['Base PostgreSQL / Supabase', config?.database],
                      ['Chiffrement des liens', config?.encryption],
                      ['Transmission Power Automate', config?.webhook],
                      ['HTTPS', config?.https],
                    ].map(([label, ok]) => (
                      <div className="settings-row" key={String(label)}>
                        <span>{label}</span>
                        <span className={`status ${ok ? 'active' : 'draft'}`}>
                          <i />
                          {ok ? 'Configuré' : demo ? 'Aperçu' : 'À configurer'}
                        </span>
                      </div>
                    ))}
                    <div className="notice">
                      Retrouvez la procédure Supabase, Vercel et SharePoint dans le README du
                      projet.
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} House of Training</span>
          <span>Écoute · L’amélioration commence ici.</span>
          <Link href="/docs">
            Documentation
            <ArrowUpRight size={12} />
          </Link>
        </footer>
      </div>
      {reactivateSession && (
        <EmailReactivationDialog
          sessionName={reactivateSession.name}
          onClose={() => setReactivateSession(null)}
          onConfirm={async (choice) => {
            await archive(reactivateSession, choice);
            setReactivateSession(null);
          }}
        />
      )}
      {emailHistoryTarget && (
        <EmailHistoryDialog
          key={emailHistoryTarget.id}
          participant={emailHistoryTarget}
          onClose={() => setEmailHistoryTarget(null)}
        />
      )}
      {emailTarget && (
        <ManualEmailDialog
          sessionId={emailTarget.sessionId}
          sessionName={emailTarget.session.name}
          participant={emailTarget}
          onClose={() => setEmailTarget(null)}
          onSent={(message) => {
            setEmailTarget(null);
            setToast(message);
            setEmailRefresh((n) => n + 1);
          }}
        />
      )}
      {editor && (
        <SessionEditor
          session={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setToast('La session a été enregistrée.');
            setEmailRefresh((n) => n + 1);
            reload();
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          sessions={sessions}
          selected={selected}
          onClose={() => setImportOpen(false)}
          onSaved={(message) => {
            setImportOpen(false);
            setToast(message);
            reload();
          }}
        />
      )}
      {demoNotice && (
        <Dialog title="Passez à votre espace de travail" onClose={() => setDemoNotice(false)}>
          <div className="dialog-body">
            <div className="modal-feature">
              <ShieldCheck size={30} />
            </div>
            <h3>Vous explorez des données d’exemple.</h3>
            <p className="muted">
              La création de sessions, l’import et les exports sont disponibles dans l’espace
              administrateur connecté à PostgreSQL.
            </p>
            <p className="notice">
              Renseignez les connexions Supabase dans votre environnement, appliquez les migrations
              et créez votre compte avec <code>npm run db:admin</code>.
            </p>
          </div>
          <div className="dialog-footer">
            <button className="btn secondary" onClick={() => setDemoNotice(false)}>
              Continuer l’aperçu
            </button>
            <Link className="btn primary" href="/login">
              Se connecter
              <ArrowRight size={16} />
            </Link>
          </div>
        </Dialog>
      )}
      {deleteSession && (
        <DeleteDialog
          session={deleteSession}
          onClose={() => setDeleteSession(null)}
          onDelete={async () => {
            try {
              await json(`/api/sessions/${deleteSession.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmation: deletionPhrase }),
              });
              setDeleteSession(null);
              go('sessions');
              reload();
              setToast('La session et ses données ont été supprimées.');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Suppression impossible.');
              throw e;
            }
          }}
        />
      )}
      {qr && (
        <Dialog title="Lien personnel du participant" onClose={() => setQr(null)}>
          <div className="dialog-body qr-dialog">
            <img
              src={qr.qrCode}
              alt="QR Code du questionnaire personnel"
              width={240}
              height={240}
            />
            <p className="muted">
              Ce lien permet une seule soumission. Partagez-le uniquement avec le participant
              concerné.
            </p>
            <input
              readOnly
              value={qr.link}
              aria-label="Lien du questionnaire"
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn primary full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(qr.link);
                  setToast('Lien copié.');
                } catch {
                  setToast('Sélectionnez le lien pour le copier.');
                }
              }}
            >
              <Copy size={16} />
              Copier le lien
            </button>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button
            className="icon-btn"
            aria-label="Fermer la notification"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Metrics({ stats }: { stats: Stats }) {
  const cards = [
    {
      label: 'Sessions de formation',
      value: fmt(stats.sessions),
      icon: CalendarDays,
      cls: 'purple',
      foot: 'Toutes vos formations',
    },
    {
      label: 'Participants inscrits',
      value: fmt(stats.participants),
      icon: Users,
      cls: 'blue',
      foot: 'Des parcours, des expériences',
    },
    {
      label: 'Réponses collectées',
      value: fmt(stats.responses),
      icon: MessageSquareText,
      cls: 'pink',
      foot: 'Des retours pour progresser',
    },
    {
      label: 'Taux de participation',
      value: percent(stats.responseRate),
      icon: Activity,
      cls: 'green',
      foot: `${fmt(stats.responses)} réponses sur ${fmt(stats.participants)} participants`,
    },
  ];
  return (
    <div className="metrics-grid">
      {cards.map((c) => (
        <div className="metric-card" key={c.label}>
          <div className="metric-top">
            <span>{c.label}</span>
            <div className={`metric-icon ${c.cls}`}>
              <c.icon size={20} />
            </div>
          </div>
          <strong>{c.value}</strong>
          <div className="metric-foot">
            {c.label === 'Taux de participation' ? (
              <span className="tiny-dot green-dot" />
            ) : (
              <span className="tiny-dot" />
            )}
            {c.foot}
          </div>
        </div>
      ))}
    </div>
  );
}
function ActivityChart({ stats }: { stats: Stats }) {
  const max = Math.max(...stats.activity.map((m) => m.count), 1),
    ceiling = Math.ceil(max / 4) * 4;
  return (
    <section className="panel activity-chart">
      <div className="panel-heading">
        <div>
          <h2>La voix de vos participants</h2>
          <p>Évolution des réponses collectées</p>
        </div>
        <span className="period-label">
          <CalendarDays size={14} />6 derniers mois
        </span>
      </div>
      <div className="chart-summary">
        <strong>{fmt(stats.activity.reduce((a, b) => a + b.count, 0))}</strong>
        <span>réponses sur la période</span>
        <span className="chart-legend">
          <i />
          Réponses
        </span>
      </div>
      <div
        className="bar-chart"
        role="img"
        aria-label={`Réponses mensuelles : ${stats.activity.map((m) => `${m.month} : ${m.count}`).join(', ')}`}
      >
        <div className="chart-y">
          {[1, 0.75, 0.5, 0.25, 0].map((v) => (
            <span key={v}>{Math.round(ceiling * v)}</span>
          ))}
        </div>
        <div className="chart-plot">
          <div className="chart-grid">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} />
            ))}
          </div>
          <div className="chart-bars">
            {stats.activity.map((m, i) => (
              <div className="chart-bar-col" key={m.month}>
                <div
                  className={`chart-bar ${i === stats.activity.length - 1 ? 'latest' : ''}`}
                  style={{ height: `${Math.max((m.count / ceiling) * 100, 1)}%` }}
                >
                  <span>{m.count}</span>
                </div>
                <small>
                  {new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString('fr-FR', {
                    month: 'short',
                  })}
                </small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
function Satisfaction({ stats }: { stats: Stats }) {
  const rate = stats.satisfaction ? stats.satisfaction / 4 : 0;
  return (
    <section className="panel satisfaction-panel">
      <div className="panel-heading">
        <div>
          <h2>La satisfaction en un regard</h2>
          <p>Chaque expérience compte.</p>
        </div>
        <Star size={18} />
      </div>
      <div className="satisfaction-content">
        <div className="satisfaction-ring">
          <svg viewBox="0 0 180 180" aria-hidden="true">
            <circle cx="90" cy="90" r="73" fill="none" stroke="#f0e8f0" strokeWidth="12" />
            <circle
              cx="90"
              cy="90"
              r="73"
              fill="none"
              stroke="url(#ring)"
              strokeWidth="12"
              strokeDasharray={`${rate * 459} 459`}
              strokeLinecap="round"
              transform="rotate(-90 90 90)"
            />
            <defs>
              <linearGradient id="ring">
                <stop stopColor="#9a4e97" />
                <stop offset="1" stopColor="#cf1972" />
              </linearGradient>
            </defs>
          </svg>
          <div>
            <strong>
              {stats.satisfaction?.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) || '—'}
              <span>/4</span>
            </strong>
            <small>Note moyenne</small>
          </div>
        </div>
        <div
          className="stars"
          aria-label={stats.satisfaction ? `${stats.satisfaction} sur 4` : 'Pas encore de note'}
        >
          {[1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              size={18}
              fill={
                stats.satisfaction && i <= Math.round(stats.satisfaction) ? 'currentColor' : 'none'
              }
            />
          ))}
        </div>
        <p>
          {stats.satisfaction === null
            ? 'Les premiers avis donneront le ton.'
            : stats.satisfaction >= 3.2
              ? 'De belles expériences à cultiver.'
              : 'Chaque retour vous aide à progresser.'}
        </p>
        <span className="satisfaction-note">Moyenne des questions de satisfaction</span>
      </div>
    </section>
  );
}
function SessionTable({
  sessions,
  onOpen,
}: {
  sessions: SessionRecord[];
  onOpen: (s: SessionRecord) => void;
}) {
  if (!sessions.length)
    return (
      <Empty
        title="Votre prochaine formation commence ici"
        text="Créez une session pour préparer votre première enquête."
      />
    );
  return (
    <div className="table-wrap">
      <table className="session-table">
        <thead>
          <tr>
            <th>FORMATION</th>
            <th>DATE</th>
            <th>PARTICIPANTS</th>
            <th>PARTICIPATION</th>
            <th>STATUT</th>
            <th>
              <span className="sr-only">Ouvrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => {
            const rate = s._count.participants
              ? (s._count.responses / s._count.participants) * 100
              : 0;
            return (
              <tr key={s.id}>
                <td>
                  <button className="training-cell" onClick={() => onOpen(s)}>
                    <span className={`training-icon color-${i % 4}`}>
                      <BookOpen size={19} />
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {s.id}
                        <span>·</span>
                        {s.trainer}
                      </small>
                    </span>
                  </button>
                </td>
                <td className="nowrap">{sessionDateRange(s.date, s.endDate)}</td>
                <td>
                  <span className="participants-count">
                    <Users size={15} />
                    {s._count.participants}
                  </span>
                </td>
                <td>
                  <div className="response-cell">
                    <span>
                      <strong>{Math.round(rate)} %</strong>
                      <small>
                        {s._count.responses}/{s._count.participants}
                      </small>
                    </span>
                    <div className="progress-track">
                      <i style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`status ${s.status.toLowerCase()}`}>
                    <i />
                    {statusLabels[s.status]}
                  </span>
                </td>
                <td>
                  <button
                    className="icon-btn table-open"
                    aria-label={`Ouvrir ${s.name}`}
                    onClick={() => onOpen(s)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function ParticipantTable({
  participants,
  onLink,
  onEmail,
  onHistory,
}: {
  participants: ParticipantRecord[];
  onLink: (p: ParticipantRecord) => void;
  onEmail?: (p: ParticipantRecord) => void;
  onHistory: (p: ParticipantRecord) => void;
}) {
  if (!participants.length)
    return (
      <Empty
        title="Aucun participant à afficher"
        text="Importez un fichier Excel ou ajustez votre recherche."
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>PARTICIPANT</th>
            <th>E-MAIL</th>
            <th>FORMATION</th>
            <th>QUESTIONNAIRE</th>
            <th>SUIVI E-MAIL</th>
            <th>LIEN PERSONNEL</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="person-cell">
                  <div className="avatar">
                    {p.firstName[0]}
                    {p.lastName[0]}
                  </div>
                  <strong>
                    {p.firstName} {p.lastName}
                  </strong>
                </div>
              </td>
              <td>{p.email}</td>
              <td>{p.session.name}</td>
              <td>
                <span className={`status ${p.submittedAt ? 'active' : 'draft'}`}>
                  <i />
                  {p.submittedAt ? 'Répondu' : 'En attente'}
                </span>
              </td>
              <td>
                <ParticipantEmailCell summary={p.emailSummary} onHistory={() => onHistory(p)} />
              </td>
              <td>
                {p.submittedAt ? (
                  <span className="subtle">
                    <Check size={14} />
                    Lien désactivé
                  </span>
                ) : (
                  <button className="text-link" onClick={() => onLink(p)}>
                    <QrCode size={16} />
                    Lien & QR Code
                  </button>
                )}
                {!p.submittedAt && onEmail && (
                  <button
                    className="text-link"
                    style={{ marginLeft: 12 }}
                    onClick={() => onEmail(p)}
                  >
                    <Send size={14} />
                    {p.emailSummary?.sentCount ? 'Envoyer un rappel' : 'Envoyer un e-mail'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Toolbar({
  query,
  setQuery,
  placeholder,
  children,
}: {
  query: string;
  setQuery: (v: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="search-input">
        <Search size={17} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {query && (
          <button
            className="icon-btn"
            aria-label="Effacer la recherche"
            onClick={() => setQuery('')}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="toolbar-filters">{children}</div>
    </div>
  );
}
function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="table-footer">
      <span>
        {total} participant{total > 1 ? 's' : ''}
        {total > 100 ? ' · La recherche filtre la page affichée.' : ''}
      </span>
      <div>
        <span>
          Page {page} sur {Math.max(1, Math.ceil(total / 100))}
        </span>
        <button
          className="icon-btn"
          disabled={page <= 1}
          aria-label="Page précédente"
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          className="icon-btn"
          disabled={page * 100 >= total}
          aria-label="Page suivante"
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <div>
        <ClipboardList size={27} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ImportDialog({
  sessions,
  selected,
  onClose,
  onSaved,
}: {
  sessions: SessionRecord[];
  selected: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog
      title="Importer des participants"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          setError('');
          const data = new FormData(e.currentTarget);
          data.set('file', file);
          try {
            const result = await json<{ imported: number; skipped: number }>(
              '/api/sessions/import-participants',
              { method: 'POST', body: data },
            );
            onSaved(
              `${result.imported} participant(s) importé(s), ${result.skipped} déjà présent(s).`,
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Import impossible.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          <p className="muted">
            Chaque participant recevra un lien personnel et sécurisé, utilisable une seule fois.
          </p>
          <label>
            Session de formation
            <select name="sessionId" defaultValue={selected} required>
              <option value="" disabled>
                Sélectionner une session
              </option>
              {sessions
                .filter((s) => s.status !== 'ARCHIVED')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.id}
                  </option>
                ))}
            </select>
          </label>
          <label
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFile(e.dataTransfer.files[0] || null);
            }}
          >
            <div>
              <FileSpreadsheet size={29} />
            </div>
            <strong>{file ? file.name : 'Déposez votre fichier Excel ici'}</strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(0)} Ko · prêt à importer`
                : 'ou cliquez pour sélectionner un fichier'}
            </span>
            <small>.xlsx uniquement · 2 Mo maximum · 1 000 participants</small>
            <input
              type="file"
              accept=".xlsx"
              aria-label="Fichier Excel des participants"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <div className="import-columns">
            <span>Colonnes attendues</span>
            <code>Nom</code>
            <code>Prénom</code>
            <code>Email</code>
          </div>
          <a href="/api/template" className="text-link">
            <Download size={15} />
            Télécharger le modèle Excel
          </a>
          <p className="notice">
            Les e-mails déjà présents dans la session seront ignorés. Aucun e-mail n’est envoyé
            automatiquement : partagez les liens via l’export Excel ou votre flux Power Automate.
          </p>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy || !file}>
            <Upload size={16} />
            {busy ? 'Import en cours…' : 'Importer et générer les liens'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function DeleteDialog({
  session,
  onClose,
  onDelete,
}: {
  session: SessionRecord;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [value, setValue] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog
      title="Supprimer définitivement la session"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="dialog-body">
        <p>
          La session <strong>{session.name}</strong>, ses participants, réponses et envois en
          attente seront supprimés. Cette action est définitive.
        </p>
        <label>
          Saisissez « supprimer la session » pour confirmer
          <input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button className="btn secondary" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn danger"
          disabled={value !== deletionPhrase || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete();
            } catch (error) {
              setError(
                error instanceof Error ? error.message : 'La suppression a échoué. Réessayez.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
      </div>
    </Dialog>
  );
}
