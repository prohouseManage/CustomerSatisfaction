'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
export default function LoginForm({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [visible, setVisible] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const data = new FormData(e.currentTarget);
        try {
          const result = await signIn('credentials', {
            email: data.get('email'),
            password: data.get('password'),
            redirect: false,
          });
          if (result?.ok) window.location.assign('/admin');
          else
            setError(
              'Connexion refusée. Vérifiez vos identifiants ou patientez après plusieurs tentatives.',
            );
        } catch {
          setError('Le service est temporairement indisponible.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Adresse e-mail
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="prenom.nom@houseoftraining.lu"
          maxLength={254}
        />
      </label>
      <label>
        Mot de passe
        <div className="password-field">
          <input
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={72}
            placeholder="Votre mot de passe"
          />
          <button
            type="button"
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <button className="btn primary full" disabled={busy || !ready}>
        {busy ? 'Connexion…' : 'Se connecter'}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
