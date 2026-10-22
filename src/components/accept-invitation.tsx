'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck, ArrowRight, LoaderCircle } from 'lucide-react';
import Brand from './brand';
import { roleLabels, type StaffRole } from '@/lib/staff-policy';
type Invitation = { email: string; name: string; role: StaffRole; expiresAt: string };
export default function AcceptInvitation() {
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    // Keep the router's opaque history state when removing this client-only fragment.
    window.history.replaceState(window.history.state, '', '/invitation');
    if (!value && sessionStorage.getItem('staff-invitation-accepted') === 'true') {
      setSuccess(true);
      setLoading(false);
      return;
    }
    if (value) sessionStorage.removeItem('staff-invitation-accepted');
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
      setError('Le lien d’invitation est incomplet. Ouvrez le lien reçu par e-mail.');
      setLoading(false);
      return;
    }
    setToken(value);
    fetch('/api/collaboration/invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: value }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setInvitation(result);
        setName(result.name);
      })
      .catch((error) =>
        setError(error instanceof Error ? error.message : 'Invitation indisponible.'),
      )
      .finally(() => setLoading(false));
  }, []);
  return (
    <main className="invitation-layout">
      <Brand />
      <section className="panel invitation-card">
        {success ? (
          <>
            <CheckCircle2 size={32} className="pink" />
            <h1>Bienvenue dans votre équipe.</h1>
            <p>
              Votre compte est activé. Connectez-vous avec votre adresse e-mail et le mot de passe
              que vous venez de choisir.
            </p>
            <Link className="btn primary full" href="/login">
              Se connecter
              <ArrowRight size={17} />
            </Link>
          </>
        ) : (
          <>
            <span className="eyebrow pink">COLLABORATION</span>
            <h1>Rejoignez votre équipe.</h1>
            <p>Activez votre accès à Écoute, l’espace de satisfaction House of Training.</p>
            {loading && (
              <p role="status">
                <LoaderCircle className="spin" size={18} /> Vérification de l’invitation…
              </p>
            )}
            {invitation && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError('');
                  const form = new FormData(event.currentTarget);
                  if (form.get('password') !== form.get('confirmation')) {
                    setError('Les deux mots de passe doivent être identiques.');
                    return;
                  }
                  setBusy(true);
                  try {
                    const response = await fetch('/api/collaboration/accept', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ token, name, password: form.get('password') }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    sessionStorage.setItem('staff-invitation-accepted', 'true');
                    setToken('');
                    setSuccess(true);
                  } catch (error) {
                    setError(error instanceof Error ? error.message : 'Activation impossible.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <dl className="invitation-identity">
                  <div>
                    <dt>Adresse e-mail</dt>
                    <dd>{invitation.email}</dd>
                  </div>
                  <div>
                    <dt>Rôle attribué</dt>
                    <dd>{roleLabels[invitation.role]}</dd>
                  </div>
                </dl>
                <label>
                  Votre nom
                  <input
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    disabled={busy}
                  />
                </label>
                <label>
                  Choisir un mot de passe
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={72}
                    aria-describedby="invitation-password-help"
                    disabled={busy}
                  />
                </label>
                <p className="muted" id="invitation-password-help">
                  Au moins 12 caractères. Utilisez un mot de passe personnel et unique.
                </p>
                <label>
                  Confirmer le mot de passe
                  <input
                    name="confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={72}
                    disabled={busy}
                  />
                </label>
                {error && (
                  <p className="error-box" role="alert">
                    {error}
                  </p>
                )}
                <button className="btn primary full" disabled={busy}>
                  {busy ? 'Activation…' : 'Activer mon compte'}
                  <ArrowRight size={17} />
                </button>
              </form>
            )}
            {!invitation && error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <div className="secure-note">
              <ShieldCheck size={16} />
              Invitation personnelle · Activation unique
            </div>
          </>
        )}
      </section>
      <Link className="text-link" href="/login">
        Retour à la connexion
      </Link>
    </main>
  );
}
