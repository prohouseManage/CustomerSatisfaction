'use client';
import { useState } from 'react';
import { ChevronRight, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react';
import { matchesReportSession, type ReportFilters } from '@/lib/report-filters';
import { sessionDateRange } from '@/lib/session-dates';
import type { SessionRecord } from '@/lib/types';

export function ReportControls({
  sessions,
  filters,
  onChange,
  onExport,
  exportDisabled,
}: {
  sessions: SessionRecord[];
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  onExport: (format: 'xlsx' | 'pdf') => void;
  exportDisabled: boolean;
}) {
  const [mode, setMode] = useState<'all' | 'day' | 'range'>(() =>
    filters.dateFrom || filters.dateTo
      ? filters.dateFrom === filters.dateTo
        ? 'day'
        : 'range'
      : 'all',
  );
  const matching = sessions.filter((session) =>
    matchesReportSession(session, { dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
  );
  return (
    <section className="panel report-filter-panel" aria-label="Filtres des rapports">
      <div className="report-filter-fields">
        <label>
          Période de formation
          <select
            aria-label="Période de formation"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as typeof mode);
              onChange({});
            }}
          >
            <option value="all">Toutes les dates</option>
            <option value="day">Une date précise</option>
            <option value="range">Une période</option>
          </select>
        </label>
        {mode === 'day' && (
          <label>
            Date de formation
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(event) =>
                onChange({
                  dateFrom: event.target.value || undefined,
                  dateTo: event.target.value || undefined,
                })
              }
            />
          </label>
        )}
        {mode === 'range' && (
          <>
            <label>
              Du
              <input
                type="date"
                value={filters.dateFrom || ''}
                max={filters.dateTo}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    sessionId: undefined,
                    dateFrom: event.target.value || undefined,
                  })
                }
              />
            </label>
            <label>
              Au
              <input
                type="date"
                value={filters.dateTo || ''}
                min={filters.dateFrom}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    sessionId: undefined,
                    dateTo: event.target.value || undefined,
                  })
                }
              />
            </label>
          </>
        )}
        <label className="report-session-select">
          Session à analyser
          <select
            aria-label="Session à analyser"
            value={filters.sessionId || ''}
            onChange={(event) =>
              onChange({ ...filters, sessionId: event.target.value || undefined })
            }
          >
            <option value="">Toutes les sessions de la période</option>
            {matching.map((session) => (
              <option key={session.id} value={session.id}>
                {session.id} · {session.name} · {sessionDateRange(session.date, session.endDate)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="report-filter-footer">
        <p className="muted">
          Filtre sur les dates des formations, bornes incluses. Les sessions sur plusieurs jours
          sont incluses si elles croisent la période.
        </p>
        <div className="report-filter-actions">
          {(mode !== 'all' || filters.sessionId) && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setMode('all');
                onChange({});
              }}
            >
              <RotateCcw size={15} />
              Réinitialiser
            </button>
          )}
          <button
            type="button"
            className="btn secondary"
            disabled={exportDisabled}
            onClick={() => onExport('xlsx')}
          >
            <FileSpreadsheet size={16} />
            Exporter Excel
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={exportDisabled}
            onClick={() => onExport('pdf')}
          >
            <FileText size={16} />
            Exporter PDF
          </button>
        </div>
      </div>
    </section>
  );
}

export function ReportSessionList({
  sessions,
  onOpen,
}: {
  sessions: SessionRecord[];
  onOpen: (session: SessionRecord) => void;
}) {
  return (
    <section className="panel report-session-list">
      <div className="panel-heading">
        <div>
          <h2>
            Sessions du périmètre <span className="subtle">({sessions.length})</span>
          </h2>
          <p>Identifiez chaque formation par sa référence et ses dates.</p>
        </div>
      </div>
      {sessions.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID SESSION</th>
                <th>FORMATION</th>
                <th>DATES</th>
                <th>PARTICIPANTS</th>
                <th>RÉPONSES</th>
                <th>
                  <span className="sr-only">Ouvrir la session</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <strong>{session.id}</strong>
                  </td>
                  <td>{session.name}</td>
                  <td>{sessionDateRange(session.date, session.endDate)}</td>
                  <td>{session._count.participants}</td>
                  <td>{session._count.responses}</td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Ouvrir la session ${session.id}`}
                      onClick={() => onOpen(session)}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="report-no-sessions">Aucune session ne correspond à ces filtres.</p>
      )}
    </section>
  );
}
