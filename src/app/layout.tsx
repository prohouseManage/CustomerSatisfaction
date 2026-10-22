import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Écoute | House of Training',
  description: 'L’espace de gestion des enquêtes de satisfaction House of Training.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
