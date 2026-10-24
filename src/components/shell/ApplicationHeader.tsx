'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Pencil } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/job-feed/helpers';
import { commitEditorSave, editorSaveSucceeded, getEditorStart, type EditorStart } from '@/lib/session-sync';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';
import { useTrackerStore } from '@/store/useTrackerStore';

const TITLE_MAX = 500;
const COMPANY_MAX = 500;
const URL_MAX = 2_000;

const inputClass =
  'mt-1 h-9 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) placeholder:text-ink-muted focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15';

interface ApplicationHeaderProps {
  session: ApplicationSession | null;
  title: string;
  statusLabel: string;
}

/**
 * The application's title row in the conversation column: the name, an Open the
 * ad link when the ad has an address, and an inline edit for the title, the
 * company and that address. The form keeps its draft outside the store and saves
 * through commitEditorSave like the other editors, writing only the fields the
 * user changed: a newer value of a field they left alone (a link added from
 * another tab, say) is never overwritten, and a field changed elsewhere that
 * they also edited is a conflict, not a silent win.
 */

type DetailFields = { jobTitle: string; company: string; jobUrl: string };
const FIELD_KEYS: (keyof DetailFields)[] = ['jobTitle', 'company', 'jobUrl'];
export function ApplicationHeader({ session, title, statusLabel }: ApplicationHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the form opened on, the editor's base revision, and what a save has put in the store that the server may not hold.
  const openedRef = useRef<DetailFields | null>(null);
  const startRef = useRef<EditorStart | undefined>(undefined);
  const appliedRef = useRef<Partial<DetailFields>>({});
  const savingRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const sessionId = session?.id ?? null;
  // A local draft has no stored row yet, so there is nothing to save an edit to.
  const canEdit = Boolean(sessionId) && !sessionId?.startsWith('session-');
  const adLink = session?.jobUrl && isSafeExternalUrl(session.jobUrl) ? session.jobUrl : null;

  // A failed save leaves the draft in the store as an unsaved edit. Cancelling, or leaving the application,
  // puts the opened values back so the autosync cannot save a change the user walked away from.
  const revertUnsaved = (id: string | null) => {
    const opened = openedRef.current;
    const applied = appliedRef.current;
    appliedRef.current = {};
    if (!id || !opened || savingRef.current) return;
    const stored = useSessionStore.getState().sessions.find((item) => item.id === id)
      ?? (useSessionStore.getState().currentSession?.id === id ? useSessionStore.getState().currentSession : null);
    if (!stored) return;
    const back: Partial<DetailFields> = {};
    for (const key of FIELD_KEYS) {
      // Only what this form wrote: a value that changed since is somebody else's.
      if (key in applied && (stored[key] ?? '') === applied[key]) back[key] = opened[key];
    }
    if (Object.keys(back).length > 0) useSessionStore.getState().updateSessionById(id, back);
  };

  // Another application opened while the form was up: the form was about the old one.
  useEffect(() => {
    setEditing(false);
    setError(null);
    return () => revertUnsaved(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  const open = () => {
    if (!session) return;
    openedRef.current = { jobTitle: session.jobTitle ?? '', company: session.company ?? '', jobUrl: session.jobUrl ?? '' };
    startRef.current = getEditorStart(session.id);
    appliedRef.current = {};
    setJobTitle(openedRef.current.jobTitle);
    setCompany(openedRef.current.company);
    setJobUrl(openedRef.current.jobUrl);
    setError(null);
    setEditing(true);
  };

  const close = () => {
    revertUnsaved(sessionId);
    returnFocus.current = true;
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const opened = openedRef.current;
    if (!session || !canEdit || !opened || saving) return;
    const draft: DetailFields = { jobTitle: jobTitle.trim(), company: company.trim(), jobUrl: jobUrl.trim() };
    if (draft.jobUrl && !isSafeExternalUrl(draft.jobUrl)) {
      setError('The link needs to start with http:// or https://.');
      return;
    }
    // Only what the user changed goes to the store: a field left alone keeps whatever the server holds now. A field an
    // earlier failed try of this form wrote is included even if it was changed back, so the store gets the opened value.
    const touched = FIELD_KEYS.filter((key) => draft[key] !== opened[key] || key in appliedRef.current);
    if (touched.length === 0) {
      close();
      return;
    }
    const id = session.id;
    const changes: Partial<DetailFields> = {};
    for (const key of touched) changes[key] = draft[key];
    setSaving(true);
    savingRef.current = true;
    setError(null);
    try {
      const outcome = await commitEditorSave(id, startRef.current, () => {
        useSessionStore.getState().updateSessionById(id, changes);
        appliedRef.current = { ...appliedRef.current, ...changes };
      });
      savingRef.current = false;
      if (!editorSaveSucceeded(outcome)) {
        setError(outcome === 'conflict'
          ? 'This application was changed elsewhere. Your text is still here.'
          : outcome === 'gone'
            ? 'This application no longer exists.'
            : "That didn't save. Try again.");
        return;
      }
      appliedRef.current = {};
      // The tracker keeps its own copy of the row and the revision its status changes are checked against.
      const saved = useSessionStore.getState().sessions.find((item) => item.id === id);
      useTrackerStore.setState((state) => ({
        rows: state.rows.map((row) => (row.id === id
          ? {
              ...row,
              ...(changes.jobTitle !== undefined ? { job_title: changes.jobTitle } : {}),
              ...(changes.company !== undefined ? { company: changes.company } : {}),
              revision: typeof saved?.revision === 'number' ? saved.revision : row.revision,
            }
          : row)),
      }));
      close();
    } catch {
      savingRef.current = false;
      setError("That didn't save. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <header className="flex-shrink-0 border-b border-border px-4 py-3">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !saving) close();
          }}
          className="space-y-2.5"
        >
          <div>
            <label htmlFor="application-job-title" className="text-xs font-medium text-ink-body">Job title</label>
            <input
              id="application-job-title"
              ref={titleRef}
              type="text"
              value={jobTitle}
              maxLength={TITLE_MAX}
              readOnly={saving}
              onChange={(event) => setJobTitle(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="application-company" className="text-xs font-medium text-ink-body">Company</label>
            <input
              id="application-company"
              type="text"
              value={company}
              maxLength={COMPANY_MAX}
              readOnly={saving}
              onChange={(event) => setCompany(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="application-job-url" className="text-xs font-medium text-ink-body">Job link</label>
            <input
              id="application-job-url"
              type="url"
              inputMode="url"
              value={jobUrl}
              maxLength={URL_MAX}
              readOnly={saving}
              placeholder="https://"
              onChange={(event) => setJobUrl(event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex min-h-9 items-center justify-end gap-2">
            <div className="min-w-0 flex-1">
              {error && <p role="alert" className="text-xs text-danger-strong">{error}</p>}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={close}
              className="inline-flex h-9 items-center rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-pill bg-brand px-4 text-sm font-semibold text-brand-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </header>
    );
  }

  return (
    <header className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        <p className="text-[11px] text-ink-muted">{statusLabel}</p>
      </div>
      {adLink && (
        <a
          href={adLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-xs font-medium text-brand transition-colors duration-(--duration-base) hover:bg-canvas hover:text-brand-strong cursor-pointer"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open the ad
        </a>
      )}
      {canEdit && (
        <button
          ref={editRef}
          type="button"
          onClick={open}
          aria-label="Edit details"
          title="Edit details"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-pill text-ink-muted transition-colors duration-(--duration-base) hover:bg-canvas hover:text-ink cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </header>
  );
}
