'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Pencil } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/job-feed/helpers';
import { commitEditorSave, editorSaveSucceeded, getEditorStart, type EditorOutcome, type EditorStart } from '@/lib/session-sync';
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
const FIELD_LABELS: Record<keyof DetailFields, string> = { jobTitle: 'Job title', company: 'Company', jobUrl: 'Job link' };

function storedSession(id: string): ApplicationSession | null {
  const state = useSessionStore.getState();
  return state.sessions.find((item) => item.id === id) ?? (state.currentSession?.id === id ? state.currentSession : null);
}

/**
 * A save that did not land must not leave the draft in the store: the autosync would save it later, behind a form that
 * said it failed. The fields go back to what the store held before the save, but only where the store still holds what
 * the save wrote (a value that changed since is somebody else's).
 */
function restoreStore(id: string, written: Partial<DetailFields>, previous: Partial<ApplicationSession>): void {
  const stored = storedSession(id);
  if (!stored) return;
  const back: Partial<ApplicationSession> = {};
  for (const key of FIELD_KEYS) {
    if (key in written && (stored[key] ?? '') === written[key]) (back as Record<string, unknown>)[key] = previous[key];
  }
  if (Object.keys(back).length > 0) useSessionStore.getState().updateSessionById(id, back);
}

export function ApplicationHeader({ session, title, statusLabel }: ApplicationHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the form opened on (or was last rebased to after a conflict) and the editor's base revision.
  const openedRef = useRef<DetailFields | null>(null);
  const startRef = useRef<EditorStart | undefined>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const sessionId = session?.id ?? null;
  // The application the header shows now, for a save that finishes after the user moved to another one.
  const shownIdRef = useRef(sessionId);
  // A local draft has no stored row yet, so there is nothing to save an edit to.
  const canEdit = Boolean(sessionId) && !sessionId?.startsWith('session-');
  const adLink = session?.jobUrl && isSafeExternalUrl(session.jobUrl) ? session.jobUrl : null;

  // Another application opened while the form was up: the form was about the old one. A save still running for it
  // finishes on its own and touches no state here (see save).
  const [formFor, setFormFor] = useState(sessionId);
  if (formFor !== sessionId) {
    setFormFor(sessionId);
    setEditing(false);
    setError(null);
    setSaving(false);
  }
  useEffect(() => {
    shownIdRef.current = sessionId;
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
    setJobTitle(openedRef.current.jobTitle);
    setCompany(openedRef.current.company);
    setJobUrl(openedRef.current.jobUrl);
    setError(null);
    setEditing(true);
  };

  const close = () => {
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
    // Only what the user changed goes to the store: a field left alone keeps whatever the server holds now.
    const touched = FIELD_KEYS.filter((key) => draft[key] !== opened[key]);
    if (touched.length === 0) {
      close();
      return;
    }
    const id = session.id;
    const start = startRef.current;
    const changes: Partial<DetailFields> = {};
    for (const key of touched) changes[key] = draft[key];
    const before: { value: Partial<ApplicationSession> | null } = { value: null };
    setSaving(true);
    setError(null);
    let outcome: EditorOutcome;
    try {
      outcome = await commitEditorSave(id, start, () => {
        const stored = storedSession(id);
        if (stored) {
          const previous: Partial<ApplicationSession> = {};
          for (const key of touched) (previous as Record<string, unknown>)[key] = stored[key];
          before.value = previous;
        }
        useSessionStore.getState().updateSessionById(id, changes);
      });
    } catch {
      outcome = 'error';
    }
    const shown = shownIdRef.current === id;

    if (editorSaveSucceeded(outcome)) {
      // The tracker keeps its own copy of the row and the revision its status changes are checked against.
      const saved = storedSession(id);
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
      if (shown) {
        setSaving(false);
        close();
      }
      return;
    }

    // Not saved, for any reason: the draft lives in the form only, and a Save tries again.
    if (before.value) restoreStore(id, changes, before.value);
    if (!shown) return;
    setSaving(false);
    if (outcome === 'conflict') {
      // The engine put the server's version back and kept the draft aside. Show what the server holds now, and make
      // the next Save a deliberate overwrite of values the user has seen: the form rebases onto them.
      const now = storedSession(id);
      const current: DetailFields = { jobTitle: now?.jobTitle ?? '', company: now?.company ?? '', jobUrl: now?.jobUrl ?? '' };
      const changedElsewhere = touched.filter((key) => current[key] !== opened[key]);
      openedRef.current = { ...opened, ...Object.fromEntries(touched.map((key) => [key, current[key]])) };
      startRef.current = getEditorStart(id);
      setError(changedElsewhere.length > 0
        ? `Changed elsewhere. ${changedElsewhere.map((key) => `${FIELD_LABELS[key]} is now ${current[key] ? `"${current[key]}"` : 'empty'}`).join('. ')}. Save again to replace it.`
        : 'This application was changed elsewhere. Check your changes and save again.');
      return;
    }
    setError(outcome === 'gone' ? 'This application no longer exists.' : "That didn't save. Try again.");
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
