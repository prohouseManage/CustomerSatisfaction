import type { Metadata } from 'next';
import './globals.css';
import { connection } from 'next/server';
export const metadata: Metadata = {
  title: 'Écoute | House of Training',
  description: 'L’espace de gestion des enquêtes de satisfaction House of Training.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonces must also be present on Next's hydration scripts.
  await connection();
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
