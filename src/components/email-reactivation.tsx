'use client';
import { useState } from 'react';
import Dialog from './dialog';
import { emailDueDate, luxembourgDate, type EmailReactivation } from '@/lib/email-policy';
export function initialEmailReactivation(): EmailReactivation {
  return { action: 'KEEP_PAUSED' };
}
export function EmailReactivationFields({
  value,
  onChange,
}: {
  value: EmailReactivation;
  onChange: (value: EmailReactivation) => void;
}) {
  const today = luxembourgDate(new Date());
  const tomorrow = emailDueDate(new Date(today), 1);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h3>Que faire des e-mails non envoyés ?</h3>
      <label className="check-label">
        <input
          type="radio"
          name="emailReactivationChoice"
          checked={value.action === 'KEEP_PAUSED'}
          onChange={() => onChange({ action: 'KEEP_PAUSED' })}
        />
        Conserver les e-mails suspendus
      </label>
      <label className="check-label">
        <input
          type="radio"
          name="emailReactivationChoice"
          checked={value.action === 'RESCHEDULE'}
          onChange={() => onChange({ action: 'RESCHEDULE', date: tomorrow })}
        />
        Reprogrammer les e-mails non envoyés
      </label>
      {value.action === 'RESCHEDULE' && (
        <label>
          Date de reprise
          <input
            type="date"
            required
            min={today}
            value={value.date}
            onChange={(e) => onChange({ action: 'RESCHEDULE', date: e.target.value })}
          />
        </label>
      )}
      <p className="muted">
        La reprise concerne uniquement les participants sans réponse et les messages non envoyés.
        Aucun renvoi des e-mails confirmés ou incertains. Les envois reprennent au passage de la
        tâche planifiée, à partir de la date choisie et selon le calendrier de la session.
      </p>
      <p className="muted">
        Si vous conservez la suspension, vous pourrez reprogrammer les e-mails plus tard depuis la
        session. Les envois manuels restent possibles une fois la session active.
      </p>
    </div>
  );
}
export default function EmailReactivationDialog({
  title = 'Réactiver la session',
  sessionName,
  onClose,
  onConfirm,
}: {
  title?: string;
  sessionName: string;
  onClose: () => void;
  onConfirm: (choice: EmailReactivation) => Promise<void>;
}) {
  const [choice, setChoice] = useState<EmailReactivation>(initialEmailReactivation),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onConfirm(choice);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Action impossible.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          <p>
            <strong>{sessionName}</strong>
          </p>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <EmailReactivationFields value={choice} onChange={setChoice} />
          </fieldset>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            autoFocus
            onClick={onClose}
          >
            Annuler
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Confirmer mon choix'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
