'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import Dialog from './dialog';
import {
  emailStatusLabels,
  deliveryLabel,
  emailDate,
  type EmailHistoryItem,
  type ParticipantEmailSummary,
} from '@/lib/email-tracking';
import type { ParticipantRecord } from '@/lib/types';

function statusClass(status: string) {
  return ['SENT', 'ACCEPTED', 'DELIVERED'].includes(status)
    ? 'active'
    : ['FAILED', 'UNKNOWN', 'REJECTED'].includes(status)
      ? 'archived'
      : 'draft';
}
export function ParticipantEmailCell({
  summary,
  onHistory,
}: {
  summary?: ParticipantEmailSummary;
  onHistory: () => void;
}) {
  if (!summary) return <span className="subtle">Suivi indisponible</span>;
  if (!summary.latest && !summary.sentCount) return <span className="subtle">Non envoyé</span>;
  const latestStatus = summary.latest?.status;
  const status = summary.latest?.providerStatus || latestStatus || 'SENT';
  const label =
    status === 'SENT'
      ? 'Accepté par Mailgun'
      : summary.sentCount > 0 && status === 'PENDING'
        ? 'Rappel en attente'
        : summary.latest
          ? deliveryLabel(summary.latest)
          : emailStatusLabels[status] || status;
  return (
    <details className="email-tracking">
      <summary title="Afficher ou masquer les détails du suivi e-mail">
        <span className={`status ${statusClass(status)}`}>
          <i />
          {label}
        </span>
        <ChevronDown size={14} className="email-tracking-chevron" aria-hidden="true" />
      </summary>
      <div className="email-tracking-details">
        {summary.sentCount > 0 && (
          <>
            {status !== 'SENT' && <span className="subtle">Dernier envoi confirmé</span>}
            <span className="subtle">{emailDate(summary.lastSentAt)}</span>
            <span
              className="subtle"
              title="Ce compteur indique les envois acceptés. Consultez le statut de livraison dans l’historique."
            >
              {summary.sentCount} envoi(s) confirmé(s)
            </span>
          </>
        )}
        {summary.latest?.notBefore && latestStatus === 'PENDING' && (
          <span className="subtle">
            À partir du{' '}
            {new Intl.DateTimeFormat('fr-LU', { timeZone: 'UTC' }).format(
              new Date(summary.latest.notBefore),
            )}
          </span>
        )}
        {summary.latest && (
          <button type="button" className="text-link" onClick={onHistory}>
            <History size={14} />
            Historique
          </button>
        )}
        {summary.latest?.providerUpdatedAt && (
          <span className="subtle">
            Statut Mailgun : {emailDate(summary.latest.providerUpdatedAt)}
          </span>
        )}
      </div>
    </details>
  );
}
type HistoryPage = { items: EmailHistoryItem[]; total: number; page: number; pageSize: number };
export default function EmailHistoryDialog({
  participant,
  onClose,
}: {
  participant: ParticipantRecord;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [data, setData] = useState<HistoryPage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    fetch(`/api/participants/${encodeURIComponent(participant.id)}/emails?page=${page}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Historique indisponible.');
        if (live) setData(body);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [participant.id, page, refresh]);
  return (
    <Dialog title="Historique des e-mails" wide onClose={onClose}>
      <div className="dialog-body">
        <p>
          <strong>
            {participant.firstName} {participant.lastName}
          </strong>{' '}
          · {participant.email}
        </p>
        <p className="muted">
          Dates en heure de Luxembourg. « Accepté » confirme la prise en charge par Mailgun. « Livré
          » confirme l’acceptation par le serveur destinataire, sans garantir la lecture ni le
          placement dans la boîte de réception. Sans événement Mailgun, la livraison reste inconnue.
        </p>
        {loading ? (
          <p role="status">Chargement de l’historique…</p>
        ) : error ? (
          <p role="alert" className="error-box">
            {error}
          </p>
        ) : data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PRÉPARÉ LE</th>
                  <th>TYPE</th>
                  <th>STATUT</th>
                  <th>ENVOYÉ LE</th>
                  <th>LIVRAISON</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{emailDate(item.createdAt)}</td>
                    <td>{item.kind === 'AUTOMATIC' ? 'Automatique' : 'Manuel'}</td>
                    <td>
                      <span className={`status ${statusClass(item.providerStatus || item.status)}`}>
                        <i />
                        {deliveryLabel(item)}
                      </span>
                      {item.lastError && (
                        <p style={{ marginTop: 6 }} className="muted">
                          {item.lastError}
                        </p>
                      )}
                      {item.notBefore && item.status === 'PENDING' && (
                        <p className="muted">
                          À partir du{' '}
                          {new Intl.DateTimeFormat('fr-LU', { timeZone: 'UTC' }).format(
                            new Date(item.notBefore),
                          )}
                        </p>
                      )}
                    </td>
                    <td>{item.sentAt ? emailDate(item.sentAt) : '—'}</td>
                    <td>
                      {item.providerUpdatedAt ? emailDate(item.providerUpdatedAt) : 'Non confirmée'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Aucun e-mail enregistré pour ce participant.</p>
        )}
        {data && data.total > 20 && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
            <button
              className="btn secondary"
              disabled={loading || page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </button>
            <span>
              Page {page} sur {Math.ceil(data.total / 20)}
            </span>
            <button
              className="btn secondary"
              disabled={loading || page * 20 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        )}
      </div>
      <div className="dialog-footer">
        <button
          className="btn secondary"
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          Actualiser
        </button>
        <button className="btn primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Dialog>
  );
}
