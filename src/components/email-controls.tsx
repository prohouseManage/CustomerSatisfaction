'use client';
import { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, Save, Send } from 'lucide-react';
import Dialog from './dialog';
import EmailReactivationDialog from './email-reactivation';
import { defaultEmailPolicy, type EmailPolicy, type EmailSchedule } from '@/lib/email-policy';
import type { ParticipantRecord } from '@/lib/types';
import { emailDate, deliveryLabel } from '@/lib/email-tracking';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Service d’e-mail indisponible.');
  return result;
}
type Service = {
  configured: boolean;
  publicLinkReady: boolean;
  ready: boolean;
  deliveryTrackingConfigured?: boolean;
};
function ServiceNotice({ service }: { service: Service }) {
  if (!service.configured)
    return (
      <p className="notice">
        Mailgun SMTP n’est pas encore configuré. Renseignez le serveur, le compte SMTP, son mot de
        passe et l’adresse d’expéditeur sur le serveur de l’application.
      </p>
    );
  if (!service.publicLinkReady)
    return (
      <p className="notice">
        Mailgun est configuré. Une adresse publique HTTPS pour l’application est nécessaire avant
        l’envoi des liens aux participants.
      </p>
    );
  return (
    <p className="muted">
      Envoi via Mailgun SMTP.{' '}
      {service.deliveryTrackingConfigured
        ? 'Le suivi de livraison est préparé. Les statuts sont mis à jour à réception des événements Mailgun.'
        : 'Suivi de livraison non configuré : seuls les envois acceptés par Mailgun sont confirmés.'}{' '}
      <a href="/docs#livraison-email" className="text-link">
        Configurer le suivi de livraison
      </a>
    </p>
  );
}
function DelayField({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      Délai après la fin de la formation (jours)
      <input
        type="number"
        min={1}
        max={365}
        required
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="muted">1 = le lendemain · 7 = une semaine · 14 = deux semaines.</span>
    </label>
  );
}
export function EmailScheduleFields({
  value,
  onChange,
}: {
  value: EmailSchedule;
  onChange: (value: EmailSchedule) => void;
}) {
  const [policy, setPolicy] = useState<EmailPolicy>(defaultEmailPolicy);
  useEffect(() => {
    let live = true;
    request<EmailPolicy>('/api/settings/email')
      .then((p) => {
        if (live) setPolicy(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <div className="section-heading">
        <h3>Invitation par e-mail</h3>
        <Mail size={18} />
      </div>
      <label>
        Calendrier d’envoi de cette session
        <select
          value={value.mode}
          onChange={(e) =>
            onChange({
              mode: e.target.value as EmailSchedule['mode'],
              delayDays: value.delayDays || policy.delayDays,
            })
          }
        >
          <option value="INHERIT">Utiliser le réglage par défaut (J+{policy.delayDays})</option>
          <option value="CUSTOM">Personnaliser le délai pour cette session</option>
          <option value="OFF">Désactiver l’envoi automatique pour cette session</option>
        </select>
      </label>
      {value.mode === 'CUSTOM' && (
        <DelayField
          value={value.delayDays || 0}
          onChange={(delayDays) => onChange({ ...value, delayDays })}
        />
      )}
      <p className="muted">
        Un seul envoi automatique à chaque participant sans réponse, après la date de fin de
        formation.{' '}
        {policy.enabled
          ? 'L’automatisation est activée dans les paramètres.'
          : 'L’automatisation est désactivée dans les paramètres généraux.'}{' '}
        La sélection d’une personne précise se fait uniquement lors d’un envoi manuel.
      </p>
    </>
  );
}
export function EmailSettingsPanel({ demo, onDemo }: { demo: boolean; onDemo: () => void }) {
  const [policy, setPolicy] = useState<EmailPolicy>(defaultEmailPolicy);
  const [service, setService] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (demo) return;
    let live = true;
    request<EmailPolicy & Service>('/api/settings/email')
      .then((p) => {
        if (live) {
          setPolicy(p);
          setService(p);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [demo]);
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <h2>Invitations et rappels par e-mail</h2>
          <p>Calendrier par défaut pour les personnes qui n’ont pas répondu.</p>
        </div>
        <Mail size={22} />
      </div>
      <form
        className="retention-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (demo) {
            onDemo();
            return;
          }
          setBusy(true);
          setError('');
          setMessage('');
          try {
            const saved = await request<EmailPolicy & Service>('/api/settings/email', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: policy.enabled, delayDays: policy.delayDays }),
            });
            setService(saved);
            setMessage('Calendrier par défaut enregistré.');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="check-label">
          <input
            type="checkbox"
            checked={policy.enabled}
            disabled={busy || (!demo && !service)}
            onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })}
          />
          Activer l’envoi automatique aux non-répondants
        </label>
        <DelayField
          value={policy.delayDays}
          disabled={busy}
          onChange={(delayDays) => setPolicy({ ...policy, delayDays })}
        />
        <p className="muted">
          Les sessions peuvent suivre ce réglage, définir un autre délai ou désactiver leur
          automatisation. Le réglage général doit être activé pour tout envoi automatique.
        </p>
        <p className="notice">
          L’activation inclut aussi les sessions actives déjà arrivées à échéance. Un participant ne
          reçoit qu’un seul envoi automatique par session. Les rappels supplémentaires se
          déclenchent manuellement.
        </p>
        {service && <ServiceNotice service={service} />}
        <p className="subtle">
          Calendrier Europe/Luxembourg. La tâche planifiée traite les échéances ; en local, son
          exécution doit être programmée sur le poste.
        </p>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <button className="btn primary" disabled={busy || (!demo && !service)}>
          <Save size={16} />
          {busy ? 'Enregistrement…' : 'Enregistrer les réglages d’e-mail'}
        </button>
      </form>
    </section>
  );
}
export function ManualEmailDialog({
  sessionId,
  sessionName,
  participant,
  onClose,
  onSent,
}: {
  sessionId: string;
  sessionName: string;
  participant?: ParticipantRecord;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog
      title="Confirmer l’envoi de l’e-mail"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="dialog-body">
        <p>
          <strong>{sessionName}</strong> · Session {sessionId}
        </p>
        <p>
          {participant ? (
            <>
              Envoyer une invitation à{' '}
              <strong>
                {participant.firstName} {participant.lastName}
              </strong>{' '}
              ({participant.email}) ?
            </>
          ) : (
            <>
              Envoyer une invitation à{' '}
              <strong>tous les participants de cette session qui n’ont pas encore répondu</strong> ?
            </>
          )}
        </p>
        <p>
          Chaque destinataire recevra son lien personnel avec un bouton « Répondre au questionnaire
          ». Les personnes ayant déjà répondu seront exclues.
        </p>
        <p className="muted">
          Cet envoi est indépendant du délai automatique. Les envois en cours ou à vérifier sont
          exclus ; un délai de cinq minutes évite les clics répétés.
        </p>
        {!!participant?.emailSummary?.sentCount && (
          <p className="notice">
            Cette personne a déjà été contactée : dernier envoi le{' '}
            {emailDate(participant.emailSummary.lastSentAt)} ({participant.emailSummary.sentCount}{' '}
            envoi(s) confirmé(s)). Cette action enverra un rappel.
          </p>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button className="btn secondary" disabled={busy} autoFocus onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const result = await request<{ message: string }>(
                `/api/sessions/${encodeURIComponent(sessionId)}/emails`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    confirmation: 'envoyer les invitations',
                    ...(participant && { participantId: participant.id }),
                  }),
                },
              );
              onSent(result.message);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Envoi impossible.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Send size={16} />
          {busy ? 'Préparation…' : 'Confirmer l’envoi'}
        </button>
      </div>
    </Dialog>
  );
}
type Overview = Service & {
  effective: EmailPolicy;
  dueDate: string;
  active: boolean;
  suspended: boolean;
  eligible: number;
  counts: Record<string, number>;
  deliveryCounts: Record<string, number>;
  recent: {
    id: string;
    status: string;
    providerStatus: string | null;
    automaticKey: string | null;
    sentAt: string | null;
    createdAt: string;
    participant: { firstName: string; lastName: string };
  }[];
};
export function SessionEmailPanel({
  sessionId,
  sessionName,
  onConfigure,
  onTrackingChanged,
}: {
  sessionId: string;
  sessionName: string;
  onConfigure: () => void;
  onTrackingChanged?: () => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [open, setOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const reload = useCallback(async () => {
    try {
      setOverview(await request<Overview>(`/api/sessions/${encodeURIComponent(sessionId)}/emails`));
      onTrackingChanged?.();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suivi indisponible.');
    }
  }, [sessionId, onTrackingChanged]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!overview?.counts.PENDING && !overview?.counts.SENDING) return;
    const timer = setInterval(() => void reload(), 10000);
    return () => clearInterval(timer);
  }, [overview?.counts.PENDING, overview?.counts.SENDING, reload]);
  return (
    <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
      <h3>
        <Mail size={18} /> Invitations par e-mail
      </h3>
      {overview && (
        <>
          <p>
            {!overview.active
              ? 'Session fermée : aucun nouvel e-mail ne sera envoyé.'
              : overview.suspended
                ? 'Les e-mails automatiques restent suspendus à votre demande.'
                : overview.effective.enabled
                  ? `Envoi automatique à J+${overview.effective.delayDays} après la fin de formation : échéance le ${new Intl.DateTimeFormat('fr-LU', { timeZone: 'UTC' }).format(new Date(overview.dueDate))}.`
                  : 'Envoi automatique désactivé.'}{' '}
            {overview.eligible} participant(s) sans réponse.
          </p>
          <p>
            {overview.counts.SENT || 0} accepté(s) par Mailgun · {overview.counts.PENDING || 0} en
            attente · {overview.counts.SENDING || 0} en cours · {overview.counts.FAILED || 0}{' '}
            échec(s) avant envoi · {overview.counts.UNKNOWN || 0} à vérifier ·{' '}
            {overview.counts.PAUSED || 0} suspendu(s)
          </p>
          <p>
            {overview.deliveryCounts.DELIVERED || 0} livré(s) au serveur destinataire ·{' '}
            {overview.deliveryCounts.REJECTED || 0} rejeté(s) / non livré(s) ·{' '}
            {overview.deliveryCounts.DEFERRED || 0} livraison(s) différée(s)
          </p>
          <ServiceNotice service={overview} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <button
              className="btn secondary"
              disabled={!overview.ready || !overview.active || !overview.eligible}
              onClick={() => setOpen(true)}
            >
              <Send size={16} />
              Envoyer aux non-répondants
            </button>
            <button className="btn secondary" onClick={onConfigure}>
              Modifier le calendrier
            </button>
            {overview.active && overview.suspended && (
              <button className="btn secondary" onClick={() => setResumeOpen(true)}>
                Reprogrammer les e-mails suspendus
              </button>
            )}
            <button className="btn secondary" onClick={() => void reload()}>
              <RefreshCw size={16} />
              Actualiser le suivi des e-mails
            </button>
          </div>
          {overview.recent.length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary>Derniers envois</summary>
              <ul>
                {overview.recent.map((d) => (
                  <li key={d.id}>
                    {d.participant.firstName} {d.participant.lastName} ·{' '}
                    {d.automaticKey ? 'Automatique' : 'Manuel'} · {deliveryLabel(d)} ·{' '}
                    {d.sentAt
                      ? `Envoyé le ${emailDate(d.sentAt)}`
                      : `Préparé le ${emailDate(d.createdAt)}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {resumeOpen && (
        <EmailReactivationDialog
          title="Reprogrammer les e-mails"
          sessionName={sessionName}
          onClose={() => setResumeOpen(false)}
          onConfirm={async (choice) => {
            await request(`/api/sessions/${encodeURIComponent(sessionId)}/emails`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(choice),
            });
            setResumeOpen(false);
            setMessage(
              choice.action === 'RESCHEDULE'
                ? 'Les e-mails non envoyés ont été reprogrammés.'
                : 'Les e-mails restent suspendus.',
            );
            await reload();
          }}
        />
      )}
      {open && (
        <ManualEmailDialog
          sessionId={sessionId}
          sessionName={sessionName}
          onClose={() => setOpen(false)}
          onSent={(message) => {
            setMessage(message);
            setOpen(false);
            void reload();
          }}
        />
      )}
    </section>
  );
}
