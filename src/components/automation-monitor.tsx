'use client';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AutomationRunView } from '@/lib/automation-policy';
import { emailDate } from '@/lib/email-tracking';
type Overview = {
  runs: AutomationRunView[];
  nextScheduledAt: string;
  overdue: boolean;
  scheduler: { vercel: boolean; configured: boolean };
  emails: { ready: boolean; automaticEnabled: boolean; counts: Record<string, number> };
  odoo: { pending: number; failed: number; uncertain: number };
  powerAutomate: { configured: boolean; pending: number; failed: number };
};
const labels: Record<string, string> = {
  RUNNING: 'En cours',
  SUCCEEDED: 'Terminée',
  PARTIAL: 'Terminée avec erreurs',
  FAILED: 'Échec',
  TIMED_OUT: 'Interrompue ou délai dépassé',
  SKIPPED: 'Ignorée',
};
export default function AutomationMonitor({ demo }: { demo: boolean }) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    if (demo) return;
    setBusy(true);
    try {
      const r = await fetch('/api/automations');
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Suivi indisponible.');
      setData(body);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suivi indisponible.');
    } finally {
      setBusy(false);
    }
  }, [demo]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 30000);
    return () => clearInterval(timer);
  }, [reload]);
  if (demo)
    return (
      <section className="panel" style={{ padding: 24 }}>
        Le suivi des exécutions réelles est disponible dans l’espace administrateur.
      </section>
    );
  return (
    <section className="panel" style={{ padding: 24 }}>
      <div className="panel-heading">
        <div>
          <h2>Suivi des automatisations</h2>
          <p>Invitations, Odoo, Power Automate et conservation des sessions.</p>
        </div>
        <button className="btn secondary" disabled={busy} onClick={() => void reload()}>
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Chargement du suivi…</p>}
      {data && (
        <>
          <p>
            Dernière exécution :{' '}
            <strong>
              {data.runs[0] ? emailDate(data.runs[0].startedAt) : 'Aucune exécution enregistrée'}
            </strong>
            .
          </p>
          <p>
            Prochaine échéance prévue : <strong>{emailDate(data.nextScheduledAt)}</strong> (06:00
            UTC chaque jour).
          </p>
          {!data.scheduler.configured && (
            <p className="error-box">
              Le secret de la tâche planifiée n’est pas configuré sur le serveur.
            </p>
          )}
          {!data.scheduler.vercel && (
            <p className="notice">
              En local, la planification doit être installée séparément. Ce suivi n’installe ni ne
              déclenche de tâche. Sur Vercel, le calendrier configuré est quotidien.
            </p>
          )}
          {data.overdue && (
            <p role="alert" className="error-box">
              L’exécution quotidienne attendue n’a pas été enregistrée. Vérifiez la planification.
            </p>
          )}
          {!!data.runs[0] && ['PARTIAL', 'FAILED', 'TIMED_OUT'].includes(data.runs[0].status) && (
            <p role="alert" className="error-box">
              La dernière exécution nécessite une vérification. Consultez ses étapes ci-dessous.
            </p>
          )}
          <div className="integration-grid" style={{ margin: '24px 0' }}>
            <div>
              <h3>E-mails</h3>
              <p>
                {data.emails.counts.PENDING || 0} en attente · {data.emails.counts.SENDING || 0} en
                cours · {data.emails.counts.FAILED || 0} en échec ·{' '}
                {data.emails.counts.UNKNOWN || 0} à vérifier
              </p>
              {!data.emails.ready && (
                <p className="notice">
                  Envois bloqués : service e-mail ou adresse publique HTTPS à configurer.
                </p>
              )}
              <p className="muted">
                Calendrier automatique {data.emails.automaticEnabled ? 'activé' : 'désactivé'}. Les
                messages suspendus restent en pause.
              </p>
            </div>
            <div>
              <h3>Odoo</h3>
              <p>
                {data.odoo.pending} en attente · {data.odoo.failed} en échec avant envoi ·{' '}
                {data.odoo.uncertain} en cours ou à vérifier
              </p>
              <p className="muted">
                Le détail et les actions sont disponibles dans chaque session.
              </p>
            </div>
            <div>
              <h3>Power Automate</h3>
              <p>
                {data.powerAutomate.pending} en attente, dont {data.powerAutomate.failed} après une
                tentative en échec.
              </p>
              {!data.powerAutomate.configured && (
                <p className="muted">
                  Connexion non configurée ; les événements restent conservés en attente.
                </p>
              )}
            </div>
          </div>
          <h3>Historique des 20 dernières exécutions</h3>
          <p className="muted">
            Une tâche terminée indique que le traitement s’est exécuté. Les compteurs de livraison
            précisent le résultat des envois. Les envois individuels immédiats restent visibles dans
            leur session.
          </p>
          {!data.runs.length ? (
            <p>Aucune exécution enregistrée depuis l’activation de ce suivi.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DÉBUT</th>
                    <th>FIN</th>
                    <th>ÉTAT</th>
                    <th>ÉTAPES</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((run) => (
                    <tr key={run.id}>
                      <td>{emailDate(run.startedAt)}</td>
                      <td>{run.finishedAt ? emailDate(run.finishedAt) : '—'}</td>
                      <td>
                        <span
                          className={`status ${run.status === 'SUCCEEDED' ? 'active' : run.status === 'RUNNING' ? 'draft' : 'archived'}`}
                        >
                          <i />
                          {labels[run.status] || run.status}
                        </span>
                      </td>
                      <td>
                        <details>
                          <summary>Voir les étapes</summary>
                          <ul>
                            {run.steps.map((step) => (
                              <li key={step.name}>
                                <strong>{step.name}</strong> : {labels[step.status] || step.status}{' '}
                                — {step.summary}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
