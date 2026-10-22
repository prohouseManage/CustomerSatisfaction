'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  ShieldCheck,
  MessageSquarePlus,
} from 'lucide-react';
import Brand from './brand';
import StarRating from './star-rating';
import { ratingMax } from '@/lib/validation';
import { sessionDateRange } from '@/lib/session-dates';
import type { QuestionInput, Answer } from '@/lib/validation';
import {
  displayQuestion,
  languageCode,
  languages,
  languageNames,
  type Language,
} from '@/lib/question-i18n';
import { participantMessages } from '@/lib/participant-messages';
export type FormDataView = {
  sessionId: string;
  name: string;
  trainer: string;
  date: string;
  endDate?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  questions: (Omit<QuestionInput, 'translations'> & { id: string; translations?: unknown })[];
  ratingCommentThreshold?: number;
};
export default function ParticipantForm({
  data,
  token,
  demo = false,
  initialLanguage = 'fr',
}: {
  data: FormDataView;
  token: string;
  demo?: boolean;
  initialLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const t = participantMessages[language];
  const missingTranslation = data.questions.some((q) => displayQuestion(q, language).missing);
  const [answers, setAnswers] = useState<Record<string, Answer['value']>>({}),
    [comments, setComments] = useState<Record<string, string>>({}),
    [openComments, setOpenComments] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [already, setAlready] = useState(false);
  const complete = data.questions.filter(
    (q) =>
      answers[q.id] !== undefined &&
      answers[q.id] !== '' &&
      (!Array.isArray(answers[q.id]) || (answers[q.id] as string[]).length > 0),
  ).length;
  function set(id: string, value: Answer['value']) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }
  function commentRequired(id: string) {
    const value = answers[id];
    return (
      data.questions.some((q) => q.id === id && q.type === 'RATING_4') &&
      typeof value === 'number' &&
      value <= (data.ratingCommentThreshold ?? 0)
    );
  }
  if (already) return <ParticipantStatus kind="completed" initialLanguage={language} />;
  if (done)
    return <ParticipantStatus kind={demo ? 'demoSaved' : 'saved'} initialLanguage={language} />;
  return (
    <div className="participant-page" lang={language}>
      <header className="participant-header">
        <Brand />
        <span>
          <LockKeyhole size={15} />
          {t.secure}
        </span>
        <LanguagePicker language={language} disabled={busy} onChange={setLanguage} />
      </header>
      {demo && (
        <div className="participant-demo">
          <strong>{t.demoTitle}</strong> · {t.demoText}
        </div>
      )}
      <main className="participant-container">
        <div className="participant-intro">
          <span className="eyebrow pink">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
          <span className="duration">
            <Clock3 size={15} />
            {t.about} {Math.max(2, Math.ceil(data.questions.length / 3))} {t.minutes}
            <span>·</span>
            {data.questions.length} {t.questions}
          </span>
        </div>
        <section className="participant-identity">
          <div className="identity-heading">
            <span className="identity-icon">
              <BookIcon />
            </span>
            <div>
              <small>{t.training}</small>
              <h2>{data.name}</h2>
            </div>
          </div>
          <div className="identity-grid">
            <div>
              <span>{t.trainer}</span>
              <strong>{data.trainer}</strong>
            </div>
            <div>
              <span>{t.date}</span>
              <strong>
                {sessionDateRange(
                  data.date,
                  data.endDate,
                  {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'Europe/Luxembourg',
                  },
                  language === 'en' ? 'en-GB' : language === 'de' ? 'de-LU' : 'fr-LU',
                )}
              </strong>
            </div>
            <div>
              <span>{t.participant}</span>
              <strong>
                {data.firstName} {data.lastName}
              </strong>
            </div>
            <div>
              <span>{t.email}</span>
              <strong>{data.email}</strong>
            </div>
          </div>
          <div className="identity-readonly">
            <LockKeyhole size={13} />
            {t.readonly}
          </div>
        </section>
        <div className="form-progress">
          <span>{t.progress}</span>
          <strong>
            {complete} / {data.questions.length}
          </strong>
          <div>
            <i style={{ width: `${(complete / data.questions.length) * 100}%` }} />
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            if (demo) {
              setDone(true);
              setBusy(false);
              window.scrollTo(0, 0);
              return;
            }
            try {
              const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: data.sessionId,
                  token,
                  language,
                  answers: Object.entries(answers)
                    .filter(([, v]) => v !== '')
                    .map(([questionId, value]) => ({
                      questionId,
                      value,
                      ...(comments[questionId]?.trim()
                        ? { comment: comments[questionId].trim() }
                        : {}),
                    })),
                }),
              });
              const body = await response.json();
              if (response.status === 409) {
                setAlready(true);
                window.scrollTo(0, 0);
                return;
              }
              if (!response.ok) throw new Error(language === 'fr' ? body.error : t.sendError);
              setDone(true);
              window.scrollTo(0, 0);
            } catch (e) {
              setError(e instanceof Error ? e.message : t.sendError);
            } finally {
              setBusy(false);
            }
          }}
        >
          {missingTranslation && <p className="notice">{t.missing}</p>}
          <div className="participant-questions">
            {data.questions.map((q, i) => {
              const display = displayQuestion(q, language);
              return (
                <fieldset key={q.id} className="participant-question">
                  <legend>
                    <span className="question-number">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      {display.label}
                      {q.required && <em aria-label={t.required}> *</em>}
                    </span>
                  </legend>
                  <div className="question-answer">
                    {q.type === 'SHORT_TEXT' ? (
                      <input
                        aria-label={display.label}
                        type="text"
                        required={q.required}
                        maxLength={500}
                        placeholder={t.answer}
                        value={String(answers[q.id] ?? '')}
                        onChange={(e) => set(q.id, e.target.value)}
                      />
                    ) : q.type === 'LONG_TEXT' ? (
                      <textarea
                        aria-label={display.label}
                        required={q.required}
                        maxLength={10000}
                        rows={4}
                        placeholder={t.longAnswer}
                        value={String(answers[q.id] ?? '')}
                        onChange={(e) => set(q.id, e.target.value)}
                      />
                    ) : q.type === 'NUMBER' ? (
                      <input
                        aria-label={display.label}
                        type="number"
                        step="any"
                        required={q.required}
                        value={String(answers[q.id] ?? '')}
                        onChange={(e) =>
                          set(q.id, e.target.value === '' ? '' : Number(e.target.value))
                        }
                      />
                    ) : q.type === 'RATING_4' ? (
                      <>
                        <StarRating
                          language={language}
                          name={q.id}
                          value={
                            typeof answers[q.id] === 'number'
                              ? (answers[q.id] as number)
                              : undefined
                          }
                          required={q.required}
                          onChange={(value) => set(q.id, value)}
                        />
                        <div className="rating-labels">
                          <span>{t.disagree}</span>
                          <span>{t.agree}</span>
                        </div>
                      </>
                    ) : q.type === 'RATING_5' || q.type === 'RATING_10' ? (
                      <>
                        <div className={`rating-options ${q.type === 'RATING_10' ? 'ten' : ''}`}>
                          {Array.from(
                            { length: q.type === 'RATING_5' ? 5 : 10 },
                            (_, n) => n + 1,
                          ).map((n) => (
                            <label key={n} className={answers[q.id] === n ? 'selected' : ''}>
                              <input
                                type="radio"
                                name={q.id}
                                value={n}
                                checked={answers[q.id] === n}
                                required={q.required}
                                onChange={() => set(q.id, n)}
                              />
                              <span>{n}</span>
                              {answers[q.id] === n && <Check size={13} />}
                            </label>
                          ))}
                        </div>
                        <div className="rating-labels">
                          <span>{t.dissatisfied}</span>
                          <span>{t.satisfied}</span>
                        </div>
                      </>
                    ) : q.type === 'SELECT' ? (
                      <select
                        aria-label={display.label}
                        value={String(answers[q.id] ?? '')}
                        required={q.required}
                        onChange={(e) => set(q.id, e.target.value)}
                      >
                        <option value="">{t.select}</option>
                        {q.options.map((o, index) => (
                          <option key={o} value={o}>
                            {display.options[index]}
                          </option>
                        ))}
                      </select>
                    ) : q.type === 'YES_NO' ? (
                      <div className="choice-options">
                        {[true, false].map((v) => (
                          <label className={answers[q.id] === v ? 'selected' : ''} key={String(v)}>
                            <input
                              type="radio"
                              name={q.id}
                              required={q.required}
                              checked={answers[q.id] === v}
                              onChange={() => set(q.id, v)}
                            />
                            {v ? t.yes : t.no}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="choice-options vertical">
                        {q.options.map((o, index) => (
                          <label
                            key={o}
                            className={
                              (
                                q.type === 'MULTIPLE_CHOICE'
                                  ? Array.isArray(answers[q.id]) &&
                                    (answers[q.id] as string[]).includes(o)
                                  : answers[q.id] === o
                              )
                                ? 'selected'
                                : ''
                            }
                          >
                            <input
                              type={q.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                              name={q.id}
                              required={
                                q.type === 'MULTIPLE_CHOICE'
                                  ? q.required &&
                                    !(
                                      Array.isArray(answers[q.id]) &&
                                      (answers[q.id] as string[]).length
                                    )
                                  : q.required
                              }
                              checked={
                                q.type === 'MULTIPLE_CHOICE'
                                  ? Array.isArray(answers[q.id]) &&
                                    (answers[q.id] as string[]).includes(o)
                                  : answers[q.id] === o
                              }
                              onChange={(e) => {
                                if (q.type === 'MULTIPLE_CHOICE') {
                                  const a = Array.isArray(answers[q.id])
                                    ? (answers[q.id] as string[])
                                    : [];
                                  set(
                                    q.id,
                                    e.target.checked ? [...a, o] : a.filter((v) => v !== o),
                                  );
                                } else set(q.id, o);
                              }}
                            />
                            {display.options[index]}
                          </label>
                        ))}
                      </div>
                    )}
                    {ratingMax(q.type) !== null && (
                      <div className="rating-comment">
                        <button
                          type="button"
                          className="text-link"
                          aria-expanded={!!openComments[q.id] || commentRequired(q.id)}
                          aria-controls={`comment-${q.id}`}
                          onClick={() =>
                            setOpenComments((current) => ({ ...current, [q.id]: !current[q.id] }))
                          }
                        >
                          <MessageSquarePlus size={15} />
                          {commentRequired(q.id)
                            ? t.commentNeeded
                            : openComments[q.id]
                              ? t.hideComment
                              : t.addComment}
                        </button>
                        {(openComments[q.id] || commentRequired(q.id)) && (
                          <label htmlFor={`comment-${q.id}`}>
                            {commentRequired(q.id) ? t.requiredComment : t.optionalComment}
                            <textarea
                              id={`comment-${q.id}`}
                              aria-label={`${t.comment} : ${display.label}`}
                              rows={3}
                              required={commentRequired(q.id)}
                              maxLength={2000}
                              value={comments[q.id] || ''}
                              placeholder={t.commentHint}
                              onChange={(e) =>
                                setComments((current) => ({ ...current, [q.id]: e.target.value }))
                              }
                            />
                          </label>
                        )}
                      </div>
                    )}
                    {!q.required && <small className="optional-note">{t.optional}</small>}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="form-submit-panel">
            <div className="privacy-message">
              <ShieldCheck size={20} />
              <p>{t.privacy}</p>
            </div>
            <p className="required-note">{t.requiredNote}</p>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            <button className="btn primary full" disabled={busy}>
              {busy ? t.sending : demo ? t.finishDemo : t.submit}
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </main>
      <footer className="participant-footer">
        <Brand />
        <span>{t.footer}</span>
        <small>© {new Date().getFullYear()} House of Training</small>
      </footer>
    </div>
  );
}
function BookIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15" />
    </svg>
  );
}
export function FormState({
  title,
  text,
  success = false,
  language = 'fr',
  onLanguageChange,
}: {
  title: string;
  text: string;
  success?: boolean;
  language?: Language;
  onLanguageChange?: (language: Language) => void;
}) {
  return (
    <main className="form-state" lang={language}>
      <Brand />
      {onLanguageChange && <LanguagePicker language={language} onChange={onLanguageChange} />}
      <div className="form-state-card">
        <div className={`state-icon ${success ? 'success' : ''}`}>
          {success ? <CheckCircle2 size={38} /> : <LockKeyhole size={36} />}
        </div>
        <span className="eyebrow pink">HOUSE OF TRAINING</span>
        <h1>{title}</h1>
        <p>{text}</p>
        <div className="state-line" />
        <small>{participantMessages[language].stateFooter}</small>
      </div>
      <footer>{participantMessages[language].stateSignature}</footer>
    </main>
  );
}
type StatusKind =
  'completed' | 'closed' | 'unavailable' | 'limited' | 'failed' | 'saved' | 'demoSaved';
export function ParticipantStatus({
  kind,
  initialLanguage = 'fr',
}: {
  kind: StatusKind;
  initialLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const t = participantMessages[language];
  const success = kind === 'saved' || kind === 'demoSaved';
  const text =
    kind === 'saved'
      ? t.saved
      : kind === 'demoSaved'
        ? t.demoSaved
        : t[
            `${kind}Text` as
              'completedText' | 'closedText' | 'unavailableText' | 'limitedText' | 'failedText'
          ];
  return (
    <FormState
      title={
        success
          ? t.thanks
          : t[kind as 'completed' | 'closed' | 'unavailable' | 'limited' | 'failed']
      }
      text={text}
      success={success}
      language={language}
      onLanguageChange={setLanguage}
    />
  );
}
function LanguagePicker({
  language,
  onChange,
  disabled = false,
}: {
  language: Language;
  onChange: (value: Language) => void;
  disabled?: boolean;
}) {
  return (
    <label className="language-picker">
      Langue / Sprache / Language
      <select
        aria-label="Langue / Sprache / Language"
        value={language}
        disabled={disabled}
        onChange={(e) => {
          const next = languageCode(e.target.value);
          onChange(next);
          const url = new URL(window.location.href);
          url.searchParams.set('lang', next);
          window.history.replaceState(null, '', url);
        }}
      >
        {languages.map((code) => (
          <option key={code} value={code}>
            {languageNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
