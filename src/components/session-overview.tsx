import { BookOpen, CalendarDays, Pencil, Users } from 'lucide-react';
import { sessionDateRange } from '@/lib/session-dates';
import type { SessionRecord } from '@/lib/types';
import { deadlinePassed, responsesOpen } from '@/lib/response-window';
import { CollectionButton } from './collection-controls';
import { emailDate } from '@/lib/email-tracking';

const languageLabels = {
  fr: 'Français',
  de: 'Allemand',
  en: 'Anglais',
  auto: 'Selon le navigateur',
};
const statusLabels = { ACTIVE: 'Active', DRAFT: 'Brouillon', ARCHIVED: 'Archivée' };

export default function SessionOverview({
  session,
  onEdit,
  onCollection,
}: {
  session: SessionRecord;
  onEdit: () => void;
  onCollection: () => void;
}) {
  const participants = session._count.participants;
  const responses = session._count.responses;
  const pending = Math.max(0, participants - responses);
  const rate = participants ? (responses / participants) * 100 : 0;
  return (
    <section className="panel session-info">
      <div className="session-overview-heading">
        <h2>Vue d’ensemble</h2>
        <span
          className={`status ${session.status === 'ACTIVE' && !responsesOpen(session) ? 'draft' : session.status.toLowerCase()}`}
        >
          <i />
          {session.status === 'ACTIVE' && !responsesOpen(session)
            ? 'Collecte clôturée'
            : statusLabels[session.status]}
        </span>
      </div>
      <dl className="session-facts">
        <div>
          <dt>Référence de session</dt>
          <dd>{session.id}</dd>
        </div>
        <div>
          <dt>Formateur</dt>
          <dd>{session.trainer}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={13} /> Dates de formation
          </dt>
          <dd>{sessionDateRange(session.date, session.endDate)}</dd>
        </div>
        <div>
          <dt>
            <BookOpen size={13} /> Questionnaire
          </dt>
          <dd>
            {session.questions.length} questions · {languageLabels[session.formLanguage || 'fr']}
          </dd>
        </div>
      </dl>
      <div className="session-description">
        <h3>Collecte des réponses</h3>
        {session.responsesClosedAt && (
          <p>Clôturée manuellement le {emailDate(session.responsesClosedAt)}.</p>
        )}
        <p>
          {session.responseDeadline
            ? `${deadlinePassed(session.responseDeadline) ? 'Date limite dépassée :' : 'Date limite :'} ${sessionDateRange(session.responseDeadline)} inclus, heure de Luxembourg.`
            : 'Aucune date limite de réponse.'}
        </p>
        <div className="collection-actions">
          <CollectionButton session={session} onClick={onCollection} />
          <button type="button" className="text-link" onClick={onEdit}>
            <Pencil size={13} /> Modifier la date limite
          </button>
        </div>
      </div>
      <div className="session-description">
        <h3>Description</h3>
        {session.description ? (
          <p>{session.description}</p>
        ) : (
          <button type="button" className="text-link" onClick={onEdit}>
            <Pencil size={13} />
            Ajouter une description
          </button>
        )}
      </div>
      <div className="session-collection">
        <div className="session-collection-stats">
          <div>
            <strong>{participants}</strong>
            <span>Participants</span>
          </div>
          <div>
            <strong>{responses}</strong>
            <span>Réponses</span>
          </div>
          <div>
            <strong>{pending}</strong>
            <span>Sans réponse</span>
          </div>
        </div>
        <div className="session-progress-label">
          <span>
            <Users size={14} /> Participation
          </span>
          <strong>{rate.toLocaleString('fr-LU', { maximumFractionDigits: 1 })} %</strong>
        </div>
        <progress
          className="session-progress"
          max={100}
          value={Math.min(100, rate)}
          aria-label="Taux de participation"
        />
        <p className="muted">
          {session.status === 'ARCHIVED'
            ? 'Session archivée : questionnaires fermés et envois suspendus.'
            : session.responsesClosedAt
              ? 'Réponses clôturées manuellement et invitations suspendues. Les résultats restent accessibles.'
              : deadlinePassed(session.responseDeadline)
                ? 'Date limite dépassée : réponses fermées et invitations suspendues. Les résultats restent accessibles.'
                : session.status === 'DRAFT'
                  ? 'Activez la session pour ouvrir les questionnaires aux participants.'
                  : pending
                    ? `${pending} participant${pending > 1 ? 's' : ''} n’${pending > 1 ? 'ont' : 'a'} pas encore répondu.`
                    : participants
                      ? 'Tous les participants ont répondu.'
                      : 'Importez les participants pour commencer la collecte.'}
        </p>
      </div>
    </section>
  );
}
