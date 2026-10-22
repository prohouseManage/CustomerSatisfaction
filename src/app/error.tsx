'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="form-state">
      <div className="form-state-card">
        <h1>Le service est momentanément indisponible.</h1>
        <p>
          Vérifiez la connexion à la base de données et les variables d’environnement, puis
          réessayez.
        </p>
        <button className="btn primary" onClick={reset}>
          Réessayer
        </button>
      </div>
    </main>
  );
}
