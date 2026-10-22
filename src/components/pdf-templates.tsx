'use client';
import { useEffect, useState } from 'react';
import {
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  LoaderCircle,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react';
import Dialog from './dialog';
import {
  builtinPdfTemplates,
  templateInput,
  templateVariables,
  type PdfTemplateInput,
  type PdfTemplateRecord,
  sessionPdfTemplateKey,
} from '@/lib/pdf-template';
import type { SessionRecord } from '@/lib/types';
import { PDF_PARTICIPANTS_PER_FILE } from '@/lib/export-policy';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error((await response.json()).error || 'La requête a échoué.');
  return response.status === 204 ? (undefined as T) : response.json();
}
const jsonOptions = (method: string, value: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Service indisponible.';

function PdfPreview({ template, sessionId }: { template: PdfTemplateInput; sessionId?: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function preview() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        '/api/pdf-templates/preview',
        jsonOptions('POST', { template: templateInput(template), sessionId }),
      );
      if (!response.ok) throw new Error((await response.json()).error);
      setUrl(URL.createObjectURL(await response.blob()));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pdf-preview">
      <button type="button" className="btn secondary" disabled={busy} onClick={preview}>
        {busy ? <LoaderCircle size={16} className="spin" /> : <Eye size={16} />} Aperçu PDF
      </button>
      <p className="pdf-help">Une page d’exemple avec un QR code de démonstration.</p>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {url && (
        <>
          <a className="text-button" href={url} target="_blank" rel="noreferrer">
            Ouvrir l’aperçu dans un nouvel onglet
          </a>
          <iframe className="pdf-frame" src={url} title="Aperçu du modèle PDF" />
        </>
      )}
    </div>
  );
}

export default function PdfTemplates({ demo, onDemo }: { demo: boolean; onDemo: () => void }) {
  const [templates, setTemplates] = useState<PdfTemplateRecord[]>(demo ? builtinPdfTemplates : []);
  const [editor, setEditor] = useState<{ id?: string; input: PdfTemplateInput } | null>(null);
  const [deleting, setDeleting] = useState<PdfTemplateRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!demo);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (demo) return;
    let live = true;
    request<PdfTemplateRecord[]>('/api/pdf-templates')
      .then((items) => {
        if (live) setTemplates(items);
      })
      .catch((e) => {
        if (live) setError(message(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [demo]);
  async function reload() {
    setTemplates(await request('/api/pdf-templates'));
  }
  function edit(template: PdfTemplateRecord, duplicate = false) {
    if (demo) {
      onDemo();
      return;
    }
    const input = templateInput(template);
    if (duplicate) input.name = `${input.name.slice(0, 65)} — copie`;
    setEditor({ id: duplicate || template.builtin ? undefined : template.id, input });
    setError('');
    setNotice('');
  }
  async function save(input: PdfTemplateInput) {
    if (!editor) return;
    await request(
      editor.id ? `/api/pdf-templates/${editor.id}` : '/api/pdf-templates',
      jsonOptions(editor.id ? 'PUT' : 'POST', input),
    );
    await reload();
    setEditor(null);
    setNotice('Le modèle PDF a été enregistré.');
  }
  async function remove() {
    if (!deleting) return;
    setWorking(true);
    setError('');
    try {
      await request(`/api/pdf-templates/${deleting.id}`, { method: 'DELETE' });
      await reload();
      setDeleting(null);
      setNotice('Le modèle PDF a été supprimé.');
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <section className="panel pdf-intro">
        <div>
          <h2>Des invitations à votre image</h2>
          <p>
            Un PDF unique, une page A4 et un QR code personnel pour chaque participant. Réutilisez
            vos modèles dans toutes vos sessions.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            demo
              ? onDemo()
              : setEditor({
                  input: { ...templateInput(builtinPdfTemplates[0]), name: 'Nouveau modèle' },
                })
          }
        >
          <Plus size={17} />
          Créer un modèle
        </button>
      </section>
      {error && !deleting && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {loading && <p role="status">Chargement des modèles…</p>}
      {!loading && !templates.length && (
        <button
          className="btn secondary"
          onClick={() => {
            setError('');
            setLoading(true);
            reload()
              .catch((e) => setError(message(e)))
              .finally(() => setLoading(false));
          }}
        >
          Réessayer
        </button>
      )}
      <div className="pdf-template-grid">
        {templates.map((t) => (
          <article className="panel pdf-template-card" key={t.id}>
            <div
              className={`pdf-miniature ${t.layout === 'BANNER' ? 'banner' : ''}`}
              style={{ '--pdf-accent': t.accentColor } as React.CSSProperties}
              aria-hidden="true"
            >
              <img src="/house-of-training.svg" alt="" />
              <div className="pdf-mini-heading">Votre avis fait la différence</div>
              <div className="pdf-mini-line" />
              <div className="pdf-mini-line short" />
              <div className="pdf-mini-session">
                Votre formation
                <br />
                <small>Date · Formateur</small>
              </div>
              <QrCode size={55} />
              <div className="pdf-mini-line short" />
            </div>
            <div className="pdf-template-info">
              <span className="pdf-template-tag">
                {t.builtin ? 'Modèle intégré' : 'Votre modèle'}
              </span>
              <h3>{t.name}</h3>
              <p>
                {t.layout === 'BANNER' ? 'Présentation avec bandeau' : 'Présentation classique'} ·
                Format A4
              </p>
              <div className="pdf-card-actions">
                <button className="btn secondary" onClick={() => edit(t, t.builtin)}>
                  {t.builtin ? <Copy size={15} /> : <Pencil size={15} />}
                  {t.builtin ? 'Personnaliser' : 'Modifier'}
                </button>
                {!t.builtin && (
                  <>
                    <button
                      className="icon-btn"
                      title={`Dupliquer ${t.name}`}
                      aria-label={`Dupliquer ${t.name}`}
                      onClick={() => edit(t, true)}
                    >
                      <Copy size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      title={`Supprimer ${t.name}`}
                      aria-label={`Supprimer ${t.name}`}
                      onClick={() => {
                        setError('');
                        setDeleting(t);
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {editor && (
        <TemplateEditor
          initial={editor.input}
          editing={!!editor.id}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <Dialog
          title="Supprimer le modèle PDF"
          onClose={() => {
            if (!working) setDeleting(null);
          }}
        >
          <div className="dialog-body">
            <p>
              Supprimer « {deleting.name} » ? Les PDF déjà téléchargés et les liens participants
              sont conservés.
            </p>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
          </div>
          <div className="dialog-footer">
            <button className="btn secondary" disabled={working} onClick={() => setDeleting(null)}>
              Annuler
            </button>
            <button className="btn primary" disabled={working} onClick={remove}>
              {working ? 'Suppression…' : 'Supprimer le modèle'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function TemplateEditor({
  initial,
  editing,
  onSave,
  onClose,
}: {
  initial: PdfTemplateInput;
  editing: boolean;
  onSave: (input: PdfTemplateInput) => Promise<void>;
  onClose: () => void;
}) {
  const [input, setInput] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = <K extends keyof PdfTemplateInput>(key: K, value: PdfTemplateInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  return (
    <Dialog
      title={editing ? 'Modifier le modèle PDF' : 'Créer un modèle PDF'}
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSave(input);
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body pdf-editor">
          <div className="form-grid">
            <label>
              Nom du modèle
              <input
                required
                maxLength={80}
                value={input.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </label>
            <label>
              Présentation
              <select
                value={input.layout}
                onChange={(e) => update('layout', e.target.value as PdfTemplateInput['layout'])}
              >
                <option value="CLASSIC">Classique</option>
                <option value="BANNER">Bandeau de couleur</option>
              </select>
            </label>
            <label className="full">
              Titre du document
              <input
                required
                maxLength={100}
                value={input.heading}
                onChange={(e) => update('heading', e.target.value)}
              />
            </label>
            <label className="full">
              Présentation de House of Training
              <textarea
                rows={2}
                maxLength={280}
                value={input.organizationText}
                onChange={(e) => update('organizationText', e.target.value)}
              />
            </label>
            <label className="full">
              Message au participant
              <textarea
                rows={4}
                maxLength={600}
                value={input.introduction}
                onChange={(e) => update('introduction', e.target.value)}
              />
            </label>
            <label className="full">
              Pied de page
              <textarea
                rows={2}
                maxLength={180}
                value={input.footer}
                onChange={(e) => update('footer', e.target.value)}
              />
            </label>
            <label>
              Couleur principale
              <input
                type="color"
                value={input.accentColor}
                onChange={(e) => update('accentColor', e.target.value)}
              />
            </label>
            <div className="pdf-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={input.showEmail}
                  onChange={(e) => update('showEmail', e.target.checked)}
                />
                Afficher l’e-mail
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={input.showDescription}
                  onChange={(e) => update('showDescription', e.target.checked)}
                />
                Afficher un extrait de la description
              </label>
            </div>
          </div>
          <div className="notice">
            Variables disponibles dans les textes :{' '}
            {templateVariables.map((v) => (
              <code key={v}>{`{{${v}}} `}</code>
            ))}
            . Elles seront remplacées pour chaque participant. Le logo, la formation, le
            destinataire et le QR code sont inclus automatiquement.
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <PdfPreview key={JSON.stringify(input)} template={input} />
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer le modèle'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function SessionPdfPanel({
  session,
  demo,
  onDemo,
  onSaved,
  onExcel,
}: {
  session: SessionRecord;
  demo: boolean;
  onDemo: () => void;
  onSaved: (session: SessionRecord) => void;
  onExcel: () => void;
}) {
  const [templates, setTemplates] = useState<PdfTemplateRecord[]>(demo ? builtinPdfTemplates : []);
  const [selected, setSelected] = useState(sessionPdfTemplateKey(session));
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);
  const pdfParts = Math.ceil(session._count.participants / PDF_PARTICIPANTS_PER_FILE);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!demo);
  const template = templates.find((t) => t.id === selected);
  useEffect(() => {
    if (demo) return;
    let live = true;
    request<PdfTemplateRecord[]>('/api/pdf-templates')
      .then((items) => {
        if (live) setTemplates(items);
      })
      .catch((e) => {
        if (live) setError(message(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [demo]);
  async function choose(templateId: string) {
    if (demo) {
      onDemo();
      return;
    }
    setSelected(templateId);
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await request<SessionRecord>(
        `/api/sessions/${encodeURIComponent(session.id)}/pdf-template`,
        jsonOptions('PUT', { templateId }),
      );
      onSaved(updated);
      setSaved(true);
    } catch (error) {
      setSelected(sessionPdfTemplateKey(session));
      setError(message(error));
    } finally {
      setSaving(false);
    }
  }
  async function download() {
    if (demo) {
      onDemo();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(session.id)}/export?format=pdf${pdfParts > 1 ? `&page=${pdfPage}` : ''}`,
      );
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr-${session.id}${pdfParts > 1 ? `-lot-${pdfPage}` : ''}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="session-pdf-panel">
      <div className="session-pdf-title">
        <QrCode size={20} />
        <h3>Fiches à remettre aux participants</h3>
      </div>
      <p>Un PDF à imprimer : une page par participant, avec son propre QR code.</p>
      {loading ? (
        <p role="status">Chargement des modèles…</p>
      ) : (
        <div>
          <label htmlFor="pdf-template-choice">Modèle PDF de cette session</label>
          <select
            id="pdf-template-choice"
            value={selected}
            disabled={saving || busy}
            onChange={(e) => choose(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="pdf-selection-status" role="status">
        {saving
          ? 'Enregistrement du modèle…'
          : saved
            ? 'Modèle enregistré pour cette session.'
            : 'Le modèle choisi est conservé pour cette session.'}
      </p>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div className="session-pdf-actions">
        <button
          className="btn secondary"
          disabled={!template || saving || busy}
          onClick={() => (demo ? onDemo() : setPreviewOpen(true))}
        >
          <Eye size={16} />
          Aperçu
        </button>
        <button
          className="btn primary"
          disabled={busy || saving || !template || !session._count.participants}
          onClick={download}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
          {busy
            ? 'Génération…'
            : pdfParts > 1
              ? `Télécharger le lot ${pdfPage}`
              : 'Télécharger toutes les fiches PDF'}
        </button>
      </div>
      {pdfParts > 1 && (
        <label>
          Lot de fiches à imprimer
          <select
            value={pdfPage}
            onChange={(e) => setPdfPage(Number(e.target.value))}
            disabled={busy}
          >
            {Array.from({ length: pdfParts }, (_, i) => (
              <option key={i} value={i + 1}>
                Lot {i + 1} : participants {i * PDF_PARTICIPANTS_PER_FILE + 1} à{' '}
                {Math.min((i + 1) * PDF_PARTICIPANTS_PER_FILE, session._count.participants)}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="pdf-page-count">
        {session._count.participants
          ? `${session._count.participants} participant(s) · une page A4 par personne${pdfParts > 1 ? ` · ${pdfParts} lots de ${PDF_PARTICIPANTS_PER_FILE} pages maximum` : ' dans un seul fichier'}`
          : 'Importez des participants pour générer leurs fiches.'}
      </p>
      <button className="btn secondary" onClick={onExcel}>
        <FileSpreadsheet size={16} />
        Liens Excel
      </button>
      {previewOpen && template && (
        <Dialog title={`Aperçu — ${template.name}`} onClose={() => setPreviewOpen(false)} wide>
          <div className="dialog-body">
            <PdfPreview template={template} sessionId={session.id} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
