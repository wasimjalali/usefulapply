'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Pencil } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/job-feed/helpers';
import { persistSessionEdits } from '@/lib/session-sync';
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
 * company and that address. The edit goes through the same revisioned sync as
 * every other change to an open application (session-sync), so a newer change
 * made elsewhere is merged, not overwritten.
 */
export function ApplicationHeader({ session, title, statusLabel }: ApplicationHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const sessionId = session?.id ?? null;
  // A local draft has no stored row yet, so there is nothing to save an edit to.
  const canEdit = Boolean(sessionId) && !sessionId?.startsWith('session-');
  const adLink = session?.jobUrl && isSafeExternalUrl(session.jobUrl) ? session.jobUrl : null;

  // Another application opened while the form was up: the form was about the old one.
  useEffect(() => {
    setEditing(false);
    setError(null);
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
    setJobTitle(session.jobTitle ?? '');
    setCompany(session.company ?? '');
    setJobUrl(session.jobUrl ?? '');
    setError(null);
    setEditing(true);
  };

  const close = () => {
    returnFocus.current = true;
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (!session || !canEdit || saving) return;
    const next = { jobTitle: jobTitle.trim(), company: company.trim(), jobUrl: jobUrl.trim() };
    if (next.jobUrl && !isSafeExternalUrl(next.jobUrl)) {
      setError('The link needs to start with http:// or https://.');
      return;
    }
    if (next.jobTitle === (session.jobTitle ?? '') && next.company === (session.company ?? '') && next.jobUrl === (session.jobUrl ?? '')) {
      close();
      return;
    }
    setSaving(true);
    setError(null);
    const id = session.id;
    useSessionStore.getState().updateSessionById(id, next);
    try {
      const outcome = await persistSessionEdits(id);
      if (outcome !== 'saved' && outcome !== 'clean') {
        setError("That didn't save. Try again.");
        return;
      }
      // The tracker keeps its own copy of the row and the revision its status changes are checked against.
      const saved = useSessionStore.getState().sessions.find((item) => item.id === id);
      useTrackerStore.setState((state) => ({
        rows: state.rows.map((row) => (row.id === id
          ? {
              ...row,
              job_title: next.jobTitle,
              company: next.company,
              revision: typeof saved?.revision === 'number' ? saved.revision : row.revision,
            }
          : row)),
      }));
      close();
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <header className="flex-shrink-0 border-b border-border px-4 py-3">
        <form
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
              placeholder="https://"
              onChange={(event) => setJobUrl(event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex min-h-9 items-center justify-end gap-2">
            <div className="min-w-0 flex-1" aria-live="polite">
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
