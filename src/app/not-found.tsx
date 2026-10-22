import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="form-state">
      <div className="form-state-card">
        <span className="eyebrow pink">ERREUR 404</span>
        <h1>Cette page est introuvable.</h1>
        <p>Vérifiez l’adresse ou revenez à votre espace.</p>
        <Link className="btn primary" href="/">
          Revenir à l’accueil
        </Link>
      </div>
    </main>
  );
}
