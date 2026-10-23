'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, GripVertical, LockKeyhole } from 'lucide-react';
import Dialog from './dialog';
import { defaultQuestions, questionTypes, typeLabels, type QuestionInput } from '@/lib/validation';
import type { SessionRecord } from '@/lib/types';
import { isOdooUrl } from '@/lib/odoo-url';
import { EmailScheduleFields } from './email-controls';
import type { EmailSchedule, EmailReactivation } from '@/lib/email-policy';
import { EmailReactivationFields, initialEmailReactivation } from './email-reactivation';
import { questionTranslations, type QuestionTranslations } from '@/lib/question-i18n';
type Details = { id: string; name: string; trainer: string };
export default function SessionEditor({
  session,
  onClose,
  onSaved,
}: {
  session?: SessionRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [questions, setQuestions] = useState<QuestionInput[]>(
    session?.questions.map(({ label, type, required, options, translations }) => ({
      label,
      type,
      required,
      options,
      translations: questionTranslations({ label, translations }),
    })) || defaultQuestions.map((q) => ({ ...q, translations: questionTranslations(q) })),
  );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const locked = Boolean(session?._count.participants);
  const [odooUrl, setOdooUrl] = useState('');
  const [odooEnabled, setOdooEnabled] = useState(true);
  const [integrationReady, setIntegrationReady] = useState(!session);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState('');
  const [emailSchedule, setEmailSchedule] = useState<EmailSchedule>(
    session?.emailSchedule
      ? { mode: session.emailSchedule.mode, delayDays: session.emailSchedule.delayDays }
      : { mode: 'INHERIT', delayDays: null },
  );
  const [status, setStatus] = useState(session?.status || 'DRAFT');
  const [startDate, setStartDate] = useState(session?.date.slice(0, 10) || '');
  const [endDate, setEndDate] = useState((session?.endDate || session?.date)?.slice(0, 10) || '');
  const [emailReactivation, setEmailReactivation] =
    useState<EmailReactivation>(initialEmailReactivation);
  const [lookupError, setLookupError] = useState('');
  const [details, setDetails] = useState<Details>({
    id: session?.id || '',
    name: session?.name || '',
    trainer: session?.trainer || '',
  });
  const manualFields = useRef(new Set<keyof Details>(session ? ['id', 'name', 'trainer'] : []));
  const automaticFields = useRef<Partial<Details>>({});
  const lookup = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  useEffect(() => {
    if (!session) return;
    let live = true;
    fetch(`/api/sessions/${encodeURIComponent(session.id)}/odoo?includeUrl=true`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Chargement du lien Odoo impossible.');
        if (live) {
          setOdooUrl(body.url || '');
          setOdooEnabled(body.url ? body.enabled : true);
          setIntegrationReady(true);
        }
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [session]);
  const verifyOdoo = useCallback(async (url: string) => {
    lookup.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++lookup.current.sequence;
    lookup.current.controller = controller;
    setVerifying(true);
    setVerification('');
    setLookupError('');
    try {
      const response = await fetch('/api/odoo/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (sequence !== lookup.current.sequence || controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || 'Vérification Odoo impossible.');
      const found: Partial<Details> = {
        ...(typeof result.sessionName === 'string' &&
          result.sessionName.length <= 200 && { name: result.sessionName }),
        ...(typeof result.trainer === 'string' &&
          result.trainer.length <= 150 && { trainer: result.trainer }),
        ...(typeof result.sessionId === 'string' &&
          /^[A-Z0-9][A-Z0-9_-]{2,49}$/.test(result.sessionId) && { id: result.sessionId }),
      };
      setDetails((current) => {
        const next = { ...current };
        for (const key of ['name', 'trainer', 'id'] as const) {
          if (found[key] && !manualFields.current.has(key)) next[key] = found[key];
        }
        return next;
      });
      automaticFields.current = found;
      setVerification(
        `${result.environment} · ${result.sessionName || 'Questionnaire compatible'}${result.trainer ? ' · ' + result.trainer : ''}. ${result.sessionId ? `Identifiant Odoo : ${result.sessionId}.` : 'Identifiant de session absent de la page : saisissez-le manuellement.'} Les champs restent modifiables. Aucune évaluation envoyée.`,
      );
    } catch (error) {
      if (sequence !== lookup.current.sequence || controller.signal.aborted) return;
      setLookupError(error instanceof Error ? error.message : 'Vérification impossible.');
    } finally {
      if (sequence === lookup.current.sequence) setVerifying(false);
    }
  }, []);
  useEffect(() => {
    if (session || !isOdooUrl(odooUrl)) return;
    const timer = setTimeout(() => void verifyOdoo(odooUrl), 500);
    return () => clearTimeout(timer);
  }, [session, odooUrl, verifyOdoo]);
  useEffect(
    () => () => {
      lookup.current.sequence++;
      lookup.current.controller?.abort();
    },
    [],
  );
  function changeDetail(key: keyof Details, value: string) {
    manualFields.current.add(key);
    setDetails((current) => ({ ...current, [key]: value }));
  }
  function update(index: number, change: Partial<QuestionInput>) {
    setQuestions((q) => q.map((v, i) => (i === index ? { ...v, ...change } : v)));
  }
  function move(index: number, offset: number) {
    setQuestions((q) => {
      const a = [...q];
      [a[index], a[index + offset]] = [a[index + offset], a[index]];
      return a;
    });
  }
  return (
    <Dialog
      title={session ? 'Modifier la session' : 'Nouvelle session de formation'}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setBusy(true);
          const f = new FormData(e.currentTarget),
            payload = Object.fromEntries(
              [
                'id',
                'name',
                'date',
                'endDate',
                'responseDeadline',
                'formLanguage',
                'trainer',
                'description',
                'status',
              ].map((k) => [k, f.get(k)]),
            );
          try {
            const r = await fetch(session ? `/api/sessions/${session.id}` : '/api/sessions', {
              method: session ? 'PATCH' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payload,
                responseDeadline: payload.responseDeadline || null,
                questions,
                odooUrl,
                odooEnabled: !!odooUrl.trim() && odooEnabled,
                emailSchedule,
                ...(session?.status === 'ARCHIVED' &&
                  status !== 'ARCHIVED' && { emailReactivation }),
              }),
            });
            const body = await r.json();
            if (!r.ok) throw new Error(body.error);
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          <p className="muted">
            Définissez la formation et les questions à poser à vos participants.
          </p>
          <div className="section-heading">
            <h3>Lien Odoo et préremplissage</h3>
            <span className="optional">facultatif</span>
          </div>
          <label>
            Lien du questionnaire Odoo
            <input
              name="odooUrl"
              type="url"
              maxLength={2048}
              value={odooUrl}
              disabled={!integrationReady || busy}
              placeholder="https://odoo.uat.houseoftraining.lu/session/satisfaction/…"
              onChange={(e) => {
                lookup.current.sequence++;
                lookup.current.controller?.abort();
                setVerifying(false);
                const previous = automaticFields.current;
                setDetails((current) => {
                  const next = { ...current };
                  for (const key of ['id', 'name', 'trainer'] as const) {
                    if (!manualFields.current.has(key) && current[key] === previous[key])
                      next[key] = '';
                  }
                  return next;
                });
                automaticFields.current = {};
                setOdooUrl(e.target.value);
                setVerification('');
                setLookupError('');
              }}
            />
          </label>
          <p className="muted">
            {session
              ? 'Vérifiez le lien pour consulter les informations Odoo. Les informations de cette session sont conservées.'
              : 'Collez le lien : la formation et le formateur se remplissent automatiquement. L’identifiant est repris uniquement s’il figure sur la page ; sinon, saisissez-le ci-dessous. Vos corrections manuelles sont conservées.'}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={odooEnabled}
              disabled={!integrationReady || !odooUrl.trim() || busy}
              onChange={(e) => setOdooEnabled(e.target.checked)}
            />
            Activer l’envoi automatique des évaluations vers Odoo
          </label>
          <button
            type="button"
            className="btn secondary"
            disabled={!integrationReady || !odooUrl.trim() || busy || verifying}
            onClick={() => void verifyOdoo(odooUrl)}
          >
            {verifying ? 'Lecture des informations Odoo…' : 'Vérifier le lien Odoo'}
          </button>
          {verifying && (
            <p role="status" className="muted">
              Lecture du formulaire Odoo…
            </p>
          )}
          {verification && (
            <p role="status" className="notice">
              {verification}
            </p>
          )}
          {lookupError && (
            <p role="alert" className="error-box">
              {lookupError} Vous pouvez compléter les informations manuellement ou réessayer la
              vérification.
            </p>
          )}
          <div className="section-heading">
            <h3>Informations de la session</h3>
          </div>
          <div className="form-grid">
            <label className="span-2">
              Nom de la formation
              <input
                name="name"
                required
                minLength={3}
                maxLength={200}
                value={details.name}
                onChange={(e) => changeDetail('name', e.target.value)}
                placeholder="Ex. DORA Foundation"
              />
            </label>
            <label>
              Identifiant unique
              <input
                name="id"
                required
                readOnly={Boolean(session)}
                pattern="[A-Z0-9][A-Z0-9_-]{2,49}"
                value={details.id}
                onChange={(e) => changeDetail('id', e.target.value)}
                placeholder="DORA-2026-001"
                title="3 à 50 caractères : lettres majuscules, chiffres et tirets"
              />
            </label>
            <label>
              Date de début
              <input
                name="date"
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!endDate || endDate === startDate) setEndDate(value);
                  setStartDate(value);
                }}
              />
            </label>
            <label>
              Date de fin
              <input
                name="endDate"
                type="date"
                required
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <span className="muted">
                Même date pour une journée. L’envoi automatique est calculé après la dernière
                journée de formation.
              </span>
            </label>
            <label>
              Formateur
              <input
                name="trainer"
                required
                minLength={2}
                maxLength={150}
                value={details.trainer}
                onChange={(e) => changeDetail('trainer', e.target.value)}
                placeholder="Prénom et nom"
              />
            </label>
            <label>
              Date limite de réponse
              <input
                name="responseDeadline"
                aria-label="Date limite de réponse"
                type="date"
                defaultValue={session?.responseDeadline?.slice(0, 10) || ''}
              />
              <span className="muted">
                Facultative. Réponses acceptées jusqu’à la fin de cette journée, heure de
                Luxembourg. Ensuite, le questionnaire ferme et les invitations sont suspendues. Les
                rapports restent accessibles. Modifiez ou retirez la date pour rouvrir la collecte.
              </span>
            </label>
            <label>
              Statut
              <select
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="DRAFT">Brouillon</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archivée</option>
              </select>
            </label>
            <label>
              Langue initiale du questionnaire
              <select
                name="formLanguage"
                aria-label="Langue initiale du questionnaire"
                defaultValue={session?.formLanguage || 'fr'}
              >
                <option value="fr">Français (par défaut)</option>
                <option value="de">Allemand</option>
                <option value="en">Anglais</option>
                <option value="auto">Automatique — langue du navigateur</option>
              </select>
              <span className="muted">
                En mode automatique : français ou allemand selon le navigateur, anglais pour les
                autres langues. Le participant peut toujours changer de langue.
              </span>
            </label>
            <label className="span-2">
              Description <span className="optional">facultatif</span>
              <textarea
                name="description"
                rows={2}
                maxLength={3000}
                defaultValue={session?.description}
                placeholder="Objectifs et contexte de la formation"
              />
            </label>
          </div>
          <EmailScheduleFields value={emailSchedule} onChange={setEmailSchedule} />
          {session?.status === 'ARCHIVED' && status !== 'ARCHIVED' && (
            <EmailReactivationFields value={emailReactivation} onChange={setEmailReactivation} />
          )}
          <div className="section-heading">
            <h3>Questionnaire</h3>
            <span className="subtle">
              {questions.length} question{questions.length > 1 ? 's' : ''}
            </span>
          </div>
          {locked && (
            <p className="notice">
              <LockKeyhole size={16} /> Le questionnaire est verrouillé car des participants ont
              déjà été importés.
            </p>
          )}
          <div className="question-editor">
            {questions.map((q, i) => (
              <div className="question-edit" key={i}>
                <fieldset
                  disabled={locked}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
                  <div className="question-edit-top">
                    <span>
                      <GripVertical size={15} /> QUESTION {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={i === 0}
                        aria-label="Monter la question"
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={i === questions.length - 1}
                        aria-label="Descendre la question"
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger-text"
                        disabled={questions.length === 1}
                        aria-label="Supprimer la question"
                        onClick={() => setQuestions((a) => a.filter((_, n) => n !== i))}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <label>
                    Intitulé
                    <input
                      required
                      minLength={3}
                      maxLength={500}
                      value={q.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                    />
                  </label>
                  <div className="question-edit-options">
                    <label>
                      Type de réponse
                      <select
                        value={q.type}
                        onChange={(e) =>
                          update(i, { type: e.target.value as QuestionInput['type'] })
                        }
                      >
                        {questionTypes
                          .filter((t) => !['RATING_5', 'RATING_10'].includes(t) || q.type === t)
                          .map((t) => (
                            <option key={t} value={t}>
                              {typeLabels[t]}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => update(i, { required: e.target.checked })}
                      />
                      Réponse obligatoire
                    </label>
                  </div>
                  {['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SELECT'].includes(q.type) && (
                    <label>
                      Choix proposés <span className="optional">un choix par ligne</span>
                      <textarea
                        rows={3}
                        value={q.options.join('\n')}
                        onChange={(e) => update(i, { options: e.target.value.split('\n') })}
                        placeholder={'Très satisfait\nSatisfait\nPeu satisfait'}
                      />
                    </label>
                  )}
                </fieldset>
                <details style={{ marginTop: 16 }}>
                  <summary>Traductions du questionnaire : allemand et anglais</summary>
                  <p className="muted">
                    Facultatives. Sans traduction, le texte français est conservé. Gardez le même
                    ordre pour les choix. Les traductions restent modifiables après import.
                  </p>
                  {(['de', 'en'] as const).map((lang) => (
                    <div key={lang} style={{ marginTop: 12 }}>
                      <label>
                        Intitulé en {lang === 'de' ? 'allemand' : 'anglais'}
                        <input
                          maxLength={500}
                          value={q.translations?.[lang]?.label || ''}
                          onChange={(e) => {
                            const translations: QuestionTranslations = { ...q.translations };
                            if (e.target.value)
                              translations[lang] = { ...translations[lang], label: e.target.value };
                            else delete translations[lang];
                            update(i, { translations });
                          }}
                        />
                      </label>
                      {q.options.length > 0 && q.translations?.[lang] && (
                        <label>
                          Choix en {lang === 'de' ? 'allemand' : 'anglais'} (un par ligne)
                          <textarea
                            rows={3}
                            value={q.translations[lang]?.options?.join('\n') || ''}
                            onChange={(e) =>
                              update(i, {
                                translations: {
                                  ...q.translations,
                                  [lang]: {
                                    ...q.translations?.[lang],
                                    options: e.target.value
                                      ? e.target.value.split('\n')
                                      : undefined,
                                  },
                                } as QuestionTranslations,
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </details>
              </div>
            ))}
          </div>
          {!locked && (
            <button
              type="button"
              className="btn secondary full dashed"
              disabled={questions.length >= 50}
              onClick={() =>
                setQuestions((q) => [
                  ...q,
                  { label: '', type: 'SHORT_TEXT', required: false, options: [] },
                ])
              }
            >
              <Plus size={17} />
              Ajouter une question
            </button>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy || verifying || !integrationReady}>
            {busy
              ? 'Enregistrement…'
              : session
                ? 'Enregistrer les modifications'
                : 'Créer la session'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
