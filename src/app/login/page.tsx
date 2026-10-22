import Brand from '@/components/brand';
import LoginForm from '@/components/login-form';
import Link from 'next/link';
import { ArrowUpRight, MessageSquareQuote, ShieldCheck } from 'lucide-react';
export const dynamic = 'force-dynamic';
export default function Login() {
  const ready = Boolean(process.env.DATABASE_URL && process.env.NEXTAUTH_SECRET);
  return (
    <main className="login-layout">
      <aside className="login-story">
        <Brand light />
        <div>
          <span className="eyebrow">L’EXPÉRIENCE APPRENANT, AU CŒUR DE TOUT.</span>
          <h1>
            Chaque avis.
            <br />
            Une opportunité
            <br />
            de progresser<span>.</span>
          </h1>
          <p>
            Écoutez vos participants, mesurez la satisfaction et faites grandir la qualité de vos
            formations.
          </p>
          <div className="story-icon">
            <MessageSquareQuote size={52} />
          </div>
        </div>
        <small>House of Training · Luxembourg</small>
      </aside>
      <section className="login-main">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="login-card">
          <span className="eyebrow pink">ESPACE ADMINISTRATEUR</span>
          <h2>Heureux de vous retrouver.</h2>
          <p className="muted">Connectez-vous à votre espace de satisfaction.</p>
          <LoginForm ready={ready} />
          <div className="secure-note">
            <ShieldCheck size={16} /> Accès réservé aux administrateurs autorisés
          </div>
          {!ready && (
            <div className="notice">
              Configuration requise : renseignez la connexion PostgreSQL et les secrets dans votre
              environnement, puis créez le compte administrateur. Consultez le fichier README du
              projet.
            </div>
          )}
          {process.env.NODE_ENV !== 'production' && (
            <Link className="demo-link" href="/demo">
              Explorer l’aperçu de l’application <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        <footer>© {new Date().getFullYear()} House of Training · Écoute</footer>
      </section>
    </main>
  );
}
