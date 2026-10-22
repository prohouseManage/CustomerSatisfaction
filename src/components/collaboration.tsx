'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  UserPlus,
  ShieldCheck,
  Users,
  RefreshCw,
  Mail,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Dialog from './dialog';
import { roleLabels, type StaffRole } from '@/lib/staff-policy';
type Member = { id: string; name: string; email: string; role: StaffRole; enabled: boolean };
type Invitation = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  expiresAt: string;
  revokedAt: string | null;
  deliveryStatus: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Overview = {
  members: Member[];
  currentMemberId: string;
  total: number;
  pageSize: number;
  invitations: Invitation[];
  service: { ready: boolean };
};
const date = (value: string) =>
  new Date(value).toLocaleString('fr-LU', {
    timeZone: 'Europe/Luxembourg',
    dateStyle: 'short',
    timeStyle: 'short',
  });
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Action indisponible.');
  return result;
}
const options = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
});
type Action = {
  title: string;
  text: string;
  url: string;
  method: string;
  data?: unknown;
  danger?: boolean;
};
export default function Collaboration({ demo, onDemo }: { demo: boolean; onDemo: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(
    demo
      ? {
          members: [
            {
              id: 'demo',
              name: 'Alex Morgan',
              email: 'alex@example.com',
              role: 'ADMIN',
              enabled: true,
            },
          ],
          currentMemberId: 'demo',
          total: 1,
          pageSize: 50,
          invitations: [],
          service: { ready: false },
        }
      : null,
  );
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const reload = useCallback(async () => {
    if (demo) return;
    try {
      setOverview(await request(`/api/collaboration?page=${page}`));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Chargement impossible.');
    }
  }, [demo, page]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const pending = overview?.invitations.some(
    (i) =>
      ['PENDING', 'SENDING'].includes(i.deliveryStatus) &&
      !i.revokedAt &&
      Date.now() - new Date(i.updatedAt).getTime() < 120000 &&
      new Date(i.expiresAt) > new Date(),
  );
  useEffect(() => {
    if (!pending || demo) return;
    const timer = setInterval(() => void reload(), 10000);
    return () => clearInterval(timer);
  }, [pending, demo, reload]);
  function confirm(next: Action) {
    if (demo) {
      onDemo();
      return;
    }
    setActionError('');
    setAction(next);
  }
  return (
    <div className="collaboration-space">
      <div className="collaboration-intro panel">
        <div>
          <span className="eyebrow pink">VOTRE ÉQUIPE</span>
          <h2>Les bons accès pour chaque collaborateur.</h2>
          <p>
            Invitez votre équipe par e-mail, puis gérez les rôles et les accès depuis cet espace.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!demo && !overview?.service.ready}
          onClick={() => (demo ? onDemo() : setInviteOpen(true))}
        >
          <UserPlus size={17} />
          Inviter un collaborateur
        </button>
      </div>
      <div className="collaboration-role-grid">
        <div className="panel collaboration-role">
          <ShieldCheck size={22} />
          <div>
            <h3>Administrateur</h3>
            <p>Accès complet, collaborateurs et paramètres globaux.</p>
          </div>
        </div>
        <div className="panel collaboration-role">
          <Users size={22} />
          <div>
            <h3>Manager</h3>
            <p>
              Sessions, participants, questionnaires, rapports et envois. Suppression définitive
              avec confirmation.
            </p>
          </div>
        </div>
      </div>
      {overview && !overview.service.ready && !demo && (
        <p className="notice">
          L’envoi des invitations nécessite un service d’e-mail configuré et une adresse publique
          HTTPS. Les accès existants restent disponibles.
        </p>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}{' '}
          <button className="text-btn" onClick={() => void reload()}>
            Réessayer
          </button>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!overview && !error && <p role="status">Chargement de l’équipe…</p>}
      {overview && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Collaborateurs <span className="muted">({overview.total})</span>
                </h2>
                <p>Les changements de rôle ou d’accès invalident les connexions précédentes.</p>
              </div>
              <button
                className="icon-btn"
                onClick={() => void reload()}
                aria-label="Actualiser les collaborateurs"
              >
                <RefreshCw size={18} />
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Collaborateur</th>
                    <th>Rôle</th>
                    <th>Accès</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.name}</strong>
                        <span className="collaboration-email">
                          {member.email}
                          {member.id === overview.currentMemberId ? ' · Vous' : ''}
                        </span>
                      </td>
                      <td>
                        {member.id === overview.currentMemberId ? (
                          roleLabels[member.role]
                        ) : (
                          <select
                            aria-label={`Rôle de ${member.name}`}
                            value={member.role}
                            onChange={(e) =>
                              confirm({
                                title: 'Changer le rôle',
                                text: `${member.name} recevra le rôle ${roleLabels[e.target.value as StaffRole]}. Une reconnexion sera nécessaire.`,
                                url: `/api/collaboration/members/${member.id}`,
                                method: 'PATCH',
                                data: { role: e.target.value },
                              })
                            }
                          >
                            <option value="MANAGER">Manager</option>
                            <option value="ADMIN">Administrateur</option>
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={`status ${member.enabled ? 'active' : 'archived'}`}>
                          {member.enabled ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td>
                        {member.id === overview.currentMemberId ? (
                          <span className="muted">Votre compte</span>
                        ) : (
                          <button
                            className="text-link"
                            onClick={() =>
                              confirm({
                                title: member.enabled
                                  ? 'Désactiver cet accès'
                                  : 'Réactiver cet accès',
                                text: member.enabled
                                  ? `${member.name} ne pourra plus accéder à l’application. Ses connexions seront invalidées ; les sessions et réponses seront conservées.`
                                  : `${member.name} pourra à nouveau se connecter avec ses identifiants.`,
                                url: `/api/collaboration/members/${member.id}`,
                                method: 'PATCH',
                                data: { enabled: !member.enabled },
                                danger: member.enabled,
                              })
                            }
                          >
                            {member.enabled ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                            {member.enabled ? 'Désactiver' : 'Réactiver'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {overview.total > overview.pageSize && (
              <div className="report-pagination">
                <button
                  className="btn secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                  Précédent
                </button>
                <span>
                  Page {page} sur {Math.ceil(overview.total / overview.pageSize)}
                </span>
                <button
                  className="btn secondary"
                  disabled={page * overview.pageSize >= overview.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Invitations</h2>
                <p>
                  Les 50 dernières invitations non acceptées. Validité de 7 jours ; un renvoi
                  invalide l’ancien lien.
                </p>
              </div>
              <Mail size={22} />
            </div>
            {!overview.invitations.length ? (
              <p className="collaboration-empty">Aucune invitation en attente.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Destinataire</th>
                      <th>Rôle</th>
                      <th>Statut</th>
                      <th>Expiration</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.invitations.map((invitation) => {
                      const expired = new Date(invitation.expiresAt) <= new Date();
                      const label = invitation.revokedAt
                        ? 'Révoquée'
                        : expired
                          ? 'Expirée'
                          : ['PENDING', 'SENDING'].includes(invitation.deliveryStatus) &&
                              Date.now() - new Date(invitation.updatedAt).getTime() >= 120000
                            ? 'Envoi à vérifier'
                            : {
                                PENDING: 'En attente d’envoi',
                                SENDING: 'Envoi en cours',
                                SENT: 'Invitation envoyée',
                                FAILED: 'Échec avant envoi',
                                UNKNOWN: 'Envoi à vérifier',
                              }[invitation.deliveryStatus] || 'À vérifier';
                      return (
                        <tr key={invitation.id}>
                          <td>
                            <strong>{invitation.name || invitation.email}</strong>
                            {invitation.name && (
                              <span className="collaboration-email">{invitation.email}</span>
                            )}
                          </td>
                          <td>{roleLabels[invitation.role]}</td>
                          <td>
                            <span
                              className={`status ${invitation.deliveryStatus === 'SENT' && !expired && !invitation.revokedAt ? 'active' : 'draft'}`}
                            >
                              {label}
                            </span>
                            {invitation.sentAt && (
                              <span className="collaboration-email">
                                Acceptée par Mailgun le {date(invitation.sentAt)}
                              </span>
                            )}
                          </td>
                          <td>{date(invitation.expiresAt)}</td>
                          <td>
                            {!invitation.revokedAt && (
                              <div className="collaboration-actions">
                                <button
                                  className="text-link"
                                  disabled={!overview.service.ready}
                                  onClick={() =>
                                    confirm({
                                      title: 'Renvoyer l’invitation',
                                      text: `Une nouvelle invitation sera envoyée à ${invitation.email}. Le lien précédent deviendra invalide. En cas d’envoi incertain, vérifiez les journaux Mailgun avant de continuer.`,
                                      url: `/api/collaboration/invitations/${invitation.id}/resend`,
                                      method: 'POST',
                                    })
                                  }
                                >
                                  Renvoyer
                                </button>
                                <button
                                  className="text-link"
                                  onClick={() =>
                                    confirm({
                                      title: 'Révoquer l’invitation',
                                      text: `Le lien envoyé à ${invitation.email} deviendra immédiatement inutilisable. Aucun compte ne sera créé.`,
                                      url: `/api/collaboration/invitations/${invitation.id}`,
                                      method: 'DELETE',
                                      danger: true,
                                    })
                                  }
                                >
                                  Révoquer
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {inviteOpen && (
        <Dialog
          title="Inviter un collaborateur"
          onClose={() => {
            if (!busy) setInviteOpen(false);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setActionError('');
              const form = new FormData(event.currentTarget);
              try {
                await request(
                  '/api/collaboration',
                  options('POST', {
                    email: form.get('email'),
                    name: form.get('name'),
                    role: form.get('role'),
                  }),
                );
                setInviteOpen(false);
                setMessage('Invitation préparée. Son statut d’envoi apparaît dans la liste.');
                await reload();
              } catch (error) {
                setActionError(error instanceof Error ? error.message : 'Invitation impossible.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="dialog-body">
              <p className="muted">
                Le destinataire recevra un lien personnel pour activer son compte et choisir son mot
                de passe.
              </p>
              <label>
                Adresse e-mail
                <input type="email" name="email" required maxLength={254} autoComplete="off" />
              </label>
              <label>
                Nom du collaborateur <span className="optional">facultatif</span>
                <input name="name" maxLength={100} autoComplete="off" />
              </label>
              <label>
                Rôle à attribuer
                <select name="role" defaultValue="MANAGER">
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </label>
              <p className="notice">
                Le lien expire après 7 jours. Le rôle Administrateur autorise aussi la gestion des
                comptes et des paramètres.
              </p>
              {actionError && (
                <p className="error-box" role="alert">
                  {actionError}
                </p>
              )}
            </div>
            <div className="dialog-footer">
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setInviteOpen(false)}
              >
                Annuler
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? 'Préparation…' : 'Envoyer l’invitation'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {action && (
        <Dialog
          title={action.title}
          onClose={() => {
            if (!busy) setAction(null);
          }}
        >
          <div className="dialog-body">
            <p>{action.text}</p>
            {actionError && (
              <p className="error-box" role="alert">
                {actionError}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <button className="btn secondary" disabled={busy} onClick={() => setAction(null)}>
              Annuler
            </button>
            <button
              className={`btn ${action.danger ? 'danger' : 'primary'}`}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setActionError('');
                try {
                  await request(action.url, options(action.method, action.data));
                  setAction(null);
                  setMessage('Les accès de l’équipe ont été mis à jour.');
                  await reload();
                } catch (error) {
                  setActionError(error instanceof Error ? error.message : 'Action impossible.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Traitement…' : 'Confirmer'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
