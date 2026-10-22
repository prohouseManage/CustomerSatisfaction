'use client';
import { useEffect, useState } from 'react';
import { Archive, Save } from 'lucide-react';
import { defaultRetention, type RetentionPolicy } from '@/lib/retention-policy';
type Overview = RetentionPolicy & { archivedCount: number; dueCount: number };
export default function RetentionSettingsPanel({
  demo,
  onDemo,
}: {
  demo: boolean;
  onDemo: () => void;
}) {
  const [policy, setPolicy] = useState<RetentionPolicy>({ ...defaultRetention });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(!demo),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (demo) return;
    let live = true;
    fetch('/api/settings/retention')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Chargement impossible.');
        if (live) {
          setPolicy({ enabled: body.enabled, value: body.value, unit: body.unit });
          setOverview(body);
        }
      })
      .catch((error) => {
        if (live) setError(error.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [demo]);
  return (
    <section className="panel settings-panel retention-panel">
      <div className="panel-heading">
        <div>
          <h2>Conservation des sessions archivées</h2>
          <p>Choisissez quand supprimer définitivement les questionnaires archivés.</p>
        </div>
        <Archive size={22} />
      </div>
      <form
        className="retention-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (demo) {
            onDemo();
            return;
          }
          setBusy(true);
          setError('');
          setMessage('');
          try {
            const response = await fetch('/api/settings/retention', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(policy),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || 'Enregistrement impossible.');
            setOverview(body);
            setMessage('La règle de conservation a été enregistrée.');
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Enregistrement impossible.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="check-label">
          <input
            type="checkbox"
            checked={policy.enabled}
            disabled={loading || busy || (!demo && !overview)}
            onChange={(event) => setPolicy({ ...policy, enabled: event.target.checked })}
          />{' '}
          Activer la suppression automatique des sessions archivées
        </label>
        <div className="retention-controls">
          <label>
            Délai après archivage
            <input
              aria-label="Délai après archivage"
              type="number"
              min={1}
              max={10000}
              required
              value={policy.value}
              disabled={loading || busy}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  value: event.target.value === '' ? 0 : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Unité du délai
            <select
              aria-label="Unité du délai"
              value={policy.unit}
              disabled={loading || busy}
              onChange={(event) =>
                setPolicy({ ...policy, unit: event.target.value as RetentionPolicy['unit'] })
              }
            >
              <option value="DAYS">Jours</option>
              <option value="MONTHS">Mois</option>
              <option value="YEARS">Années</option>
            </select>
          </label>
        </div>
        <p className="muted">
          Le délai commence à l’archivage. Réactiver une session annule son échéance ; un nouvel
          archivage fait repartir le délai. Les mois et années sont calendaires.
        </p>
        <div className="retention-warning">
          La suppression efface définitivement la session, ses participants, ses réponses, ses
          commentaires et ses liens dans cette application. Cette règle s’applique aussi aux
          sessions déjà archivées. Les données déjà transmises à Odoo ou SharePoint restent dans ces
          outils.
        </div>
        {overview && (
          <p className="muted">
            Règle enregistrée : {overview.enabled ? 'activée' : 'désactivée'}.{' '}
            {overview.archivedCount} session(s) archivée(s), dont {overview.dueCount} ayant atteint
            le délai enregistré.
          </p>
        )}
        <p className="subtle">
          Le nettoyage est exécuté par la tâche quotidienne du déploiement. En utilisation locale,
          un nettoyage doit être planifié sur le poste.
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
        <button className="btn primary" disabled={loading || busy || (!demo && !overview)}>
          <Save size={16} />
          {busy ? 'Enregistrement…' : 'Enregistrer la conservation'}
        </button>
      </form>
    </section>
  );
}
