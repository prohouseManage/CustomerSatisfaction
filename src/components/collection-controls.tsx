'use client';
import { useState } from 'react';
import { LockKeyhole, LockOpen } from 'lucide-react';
import Dialog from './dialog';
import type { SessionRecord } from '@/lib/types';
import { responsesOpen } from '@/lib/response-window';
import { sessionLabel } from '@/lib/session-identity';

export function CollectionButton({
  session,
  onClick,
  compact = false,
}: {
  session: SessionRecord;
  onClick: () => void;
  compact?: boolean;
}) {
  if (session.status !== 'ACTIVE') return null;
  const open = responsesOpen(session);
  return (
    <button
      type="button"
      className={`btn secondary${compact ? ' collection-compact' : ''}`}
      onClick={onClick}
      aria-label={
        compact
          ? `${open ? 'Clôturer' : 'Rouvrir'} les réponses de la session ${session.id}`
          : undefined
      }
    >
      {open ? <LockKeyhole size={15} /> : <LockOpen size={15} />}
      {compact
        ? open
          ? 'Clôturer'
          : 'Rouvrir'
        : open
          ? 'Clôturer les réponses'
          : 'Rouvrir les réponses'}
    </button>
  );
}

export default function CollectionDialog({
  session,
  onClose,
  onSaved,
}: {
  session: SessionRecord;
  onClose: () => void;
  onSaved: (session: SessionRecord) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const close = responsesOpen(session);
  const title = close ? 'Clôturer les réponses' : 'Rouvrir les réponses';
  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="dialog-body">
        <p>
          <strong>{sessionLabel(session)}</strong>
        </p>
        <p>
          {close
            ? 'Les participants ne pourront plus envoyer de réponse, même si leur formulaire est déjà ouvert. Les invitations en attente seront suspendues. La session et ses rapports restent accessibles.'
            : 'Les participants qui n’ont pas encore répondu pourront utiliser leur lien personnel. Les liens déjà complétés restent désactivés.'}
        </p>
        {!close && (
          <p className="notice">
            Si la date limite est dépassée, elle sera retirée pour permettre la réouverture. Une
            date limite future est conservée. Les invitations en attente pourront reprendre selon
            leur calendrier ; ce bouton n’envoie aucun e-mail immédiatement.
          </p>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button className="btn secondary" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const response = await fetch(
                `/api/sessions/${encodeURIComponent(session.id)}/collection`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: close ? 'CLOSE' : 'REOPEN' }),
                },
              );
              const body = await response.json();
              if (!response.ok)
                throw new Error(body.error || 'Modification de la collecte impossible.');
              onSaved(body);
            } catch (error) {
              setError(error instanceof Error ? error.message : 'Action impossible.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Enregistrement…' : close ? 'Confirmer la clôture' : 'Confirmer la réouverture'}
        </button>
      </div>
    </Dialog>
  );
}
