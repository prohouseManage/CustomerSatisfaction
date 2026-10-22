'use client';
import { useState } from 'react';
import { UserRound, Mail, Archive, ShieldCheck, Settings2, Users, ArrowRight } from 'lucide-react';
import { EmailSettingsPanel } from './email-controls';
import RetentionSettingsPanel from './retention-settings';
import { roleLabels, type StaffRole } from '@/lib/staff-policy';
type Config = { database: boolean; encryption: boolean; webhook: boolean; https: boolean };
export default function SettingsPanel({
  name,
  email,
  role,
  config,
  demo,
  onDemo,
  onCollaboration,
}: {
  name: string;
  email: string;
  role: StaffRole;
  config: Config | null;
  demo: boolean;
  onDemo: () => void;
  onCollaboration: () => void;
}) {
  const [section, setSection] = useState('account');
  const isAdmin = role === 'ADMIN';
  const sections = [
    { id: 'account', label: 'Mon compte', icon: UserRound, description: 'Profil et accès' },
    ...(isAdmin
      ? [
          {
            id: 'email',
            label: 'Invitations de formation',
            icon: Mail,
            description: 'Calendrier par défaut',
          },
          {
            id: 'retention',
            label: 'Conservation',
            icon: Archive,
            description: 'Sessions archivées',
          },
          {
            id: 'services',
            label: 'Services',
            icon: Settings2,
            description: 'État des connexions',
          },
        ]
      : []),
  ];
  return (
    <div className="settings-layout">
      <nav className="settings-navigation" aria-label="Rubriques des paramètres">
        {sections.map((item) => (
          <button
            key={item.id}
            className={section === item.id ? 'selected' : ''}
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            <item.icon size={19} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {section === 'account' && (
          <>
            <section className="panel settings-account">
              <div className="panel-heading">
                <div>
                  <h2>Votre compte</h2>
                  <p>Votre profil et vos autorisations dans l’équipe.</p>
                </div>
                <ShieldCheck size={23} />
              </div>
              <div className="settings-profile">
                <div className="settings-profile-avatar">
                  {name
                    .split(' ')
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div>
                  <h3>{name}</h3>
                  <p>{email || 'Compte de démonstration'}</p>
                  <span className="status active">{roleLabels[role]}</span>
                </div>
              </div>
              <dl className="settings-account-details">
                <div>
                  <dt>Durée de connexion</dt>
                  <dd>8 heures maximum</dd>
                </div>
                <div>
                  <dt>Autorisations</dt>
                  <dd>
                    {isAdmin
                      ? 'Accès complet, gestion de l’équipe et réglages globaux.'
                      : 'Gestion des sessions, questionnaires, participants, rapports et envois. Suppression définitive avec confirmation.'}
                  </dd>
                </div>
              </dl>
            </section>
            {isAdmin ? (
              <section className="panel settings-team-shortcut">
                <Users size={24} />
                <div>
                  <h3>Gérer votre équipe</h3>
                  <p>Invitez des collaborateurs et attribuez les rôles depuis Collaboration.</p>
                </div>
                <button className="btn secondary" onClick={onCollaboration}>
                  Gérer les collaborateurs
                  <ArrowRight size={16} />
                </button>
              </section>
            ) : (
              <p className="notice">
                Pour modifier votre rôle ou les paramètres généraux, contactez un administrateur.
              </p>
            )}
            {isAdmin && (
              <div className="settings-shortcuts">
                <button onClick={() => setSection('email')}>
                  <Mail size={20} />
                  <strong>Automatiser les invitations</strong>
                  <span>
                    Définir le délai après formation
                    <ArrowRight size={15} />
                  </span>
                </button>
                <button onClick={() => setSection('retention')}>
                  <Archive size={20} />
                  <strong>Conserver les questionnaires</strong>
                  <span>
                    Choisir le délai de suppression
                    <ArrowRight size={15} />
                  </span>
                </button>
              </div>
            )}
          </>
        )}
        {section === 'email' && isAdmin && <EmailSettingsPanel demo={demo} onDemo={onDemo} />}
        {section === 'retention' && isAdmin && (
          <RetentionSettingsPanel demo={demo} onDemo={onDemo} />
        )}
        {section === 'services' && isAdmin && (
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>État des services</h2>
                <p>Vérifiez les connexions utilisées par votre application.</p>
              </div>
              <Settings2 size={22} />
            </div>
            {[
              ['Base de données', config?.database],
              ['Protection des liens personnels', config?.encryption],
              ['Power Automate', config?.webhook],
              ['Adresse sécurisée HTTPS', config?.https],
            ].map(([label, ready]) => (
              <div className="settings-row" key={String(label)}>
                <span>{label}</span>
                <span className={`status ${ready ? 'active' : 'draft'}`}>
                  {ready ? 'Configuré' : demo ? 'Aperçu' : !config ? 'Chargement…' : 'À configurer'}
                </span>
              </div>
            ))}
            <div className="notice">
              Les identifiants des services sont gérés dans l’environnement sécurisé de
              l’application.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
