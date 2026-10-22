'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Send, Settings2 } from 'lucide-react';
import Dialog from './dialog';
type Status = {
  configured: boolean;
  targetSessionId: string | null;
  environment: string | null;
  sent: number;
  pending: number;
  failed: number;
  uncertain: number;
  lastError: string | null;
};
export default function OdooPanel({
  sessionId,
  sessionName,
  onConfigure,
}: {
  sessionId: string;
  sessionName: string;
  onConfigure: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manualError, setManualError] = useState('');
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/odoo`;
  const reload = useCallback(async () => {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Statut Odoo indisponible.');
      setStatus(body);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Statut Odoo indisponible.');
    }
  }, [url]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!status?.pending && !status?.uncertain) return;
    const timer = setInterval(() => void reload(), 10000);
    return () => clearInterval(timer);
  }, [status?.pending, status?.uncertain, reload]);
  async function verify() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/odoo/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Vérification Odoo impossible.');
      setMessage(
        `Lien vérifié · ${result.sessionName || 'Questionnaire compatible'}${result.trainer ? ' · ' + result.trainer : ''}. Aucune évaluation envoyée.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Vérification impossible.');
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    setManualError('');
    try {
      const response = await fetch(url, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Envoi Odoo indisponible.');
      setMessage(body.message);
      setConfirmOpen(false);
      await reload();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : 'Envoi Odoo indisponible.');
    } finally {
      setBusy(false);
    }
  }
  if (!status) return error ? <p role="alert">{error}</p> : null;
  return (
    <section
      className="panel"
      style={{ padding: 24, marginBottom: 24 }}
      aria-label="Intégration Odoo"
    >
      <h3>Envoi vers Odoo{status.configured ? ` · ${status.environment}` : ''}</h3>
      <p>
        {status.configured
          ? 'Les nouvelles évaluations sont envoyées automatiquement au questionnaire Odoo associé à cette session.'
          : 'Ajoutez le lien du questionnaire Odoo dans les paramètres de cette session pour activer l’envoi automatique.'}
      </p>
      <p>
        {status.sent} confirmé(s) · {status.pending} en attente · {status.failed} échec(s) avant
        envoi · {status.uncertain} à vérifier
      </p>
      {status.uncertain > 0 && (
        <p role="status">
          Un envoi est en cours ou sans confirmation. Les envois incertains restent bloqués pour
          éviter les doublons ; vérifiez-les dans Odoo.
        </p>
      )}
      {status.lastError && <p role="alert">{status.lastError}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {status.configured && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setManualError('');
              setConfirmOpen(true);
            }}
          >
            <Send size={16} /> Envoi manuel vers Odoo
          </button>
        )}
        {status.configured && (
          <button className="btn secondary" disabled={busy} onClick={() => void verify()}>
            <CheckCircle2 size={16} /> Vérifier le lien Odoo
          </button>
        )}
        <button className="btn secondary" disabled={busy} onClick={onConfigure}>
          <Settings2 size={16} /> Configurer le lien Odoo
        </button>
        <button className="btn secondary" disabled={busy} onClick={() => void reload()}>
          <RefreshCw size={16} /> Actualiser le suivi Odoo
        </button>
      </div>
      {confirmOpen && (
        <Dialog
          title="Confirmer l’envoi manuel vers Odoo"
          onClose={() => {
            if (!busy) setConfirmOpen(false);
          }}
        >
          <div className="dialog-body">
            <p>
              <strong>{sessionName}</strong>
              <br />
              Session {sessionId} · {status.environment}
            </p>
            <p>
              Les nouvelles réponses sont déjà envoyées automatiquement. L’envoi manuel sert à
              transmettre les réponses reçues avant l’activation d’Odoo ou à relancer un échec
              survenu avant l’envoi.
            </p>
            <p>
              Les réponses déjà confirmées et les envois incertains restent protégés contre un
              nouvel envoi.
            </p>
            <p>Souhaitez-vous lancer ce rattrapage pour cette session ?</p>
            {manualError && (
              <p className="error-box" role="alert">
                {manualError}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <button
              className="btn secondary"
              disabled={busy}
              autoFocus
              onClick={() => setConfirmOpen(false)}
            >
              Annuler
            </button>
            <button className="btn primary" disabled={busy} onClick={() => void send()}>
              <Send size={16} />
              {busy ? 'Lancement…' : 'Confirmer l’envoi manuel'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
