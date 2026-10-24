'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Check, Clock, DollarSign, ExternalLink, Globe, MapPin, Search, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { JobFeedDescription, workModeLabel } from './job-ad-text';
import { canDismissJob, formatJobAge, safeEmployerUrl } from './feed-format';
import { CREDIT_COSTS } from '@/lib/credit-costs';

interface FeedJobDetailProps {
  job: JobFeedFeedItem;
  onBack: () => void;
  onCheckFit: (job: JobFeedFeedItem) => void;
  onGenerateKit: (job: JobFeedFeedItem) => void;
  onSave: (job: JobFeedFeedItem) => void;
  /** Left out where dismissing isn't allowed (the Free plan). */
  onDismiss?: (job: JobFeedFeedItem) => void;
  /** Left out with onDismiss: ratings are Plus and Max only. */
  onRateHelpful?: (job: JobFeedFeedItem) => void;
  onRateNotRelevant?: (job: JobFeedFeedItem) => void;
  onOpenEmployerSite: (job: JobFeedFeedItem) => void;
  onUpgrade?: () => void;
  busy?: boolean;
  /** True only while this job's own dismiss or "not relevant" is in flight. */
  dismissing?: boolean;
  /** False on the mobile read-only feed, where the kit cannot be generated. */
  showCheckFit?: boolean;
  canAffordFit?: boolean;
  canAffordKit?: boolean;
}

function MetaChip({ icon: Icon, label, tone = 'default' }: {
  icon: typeof MapPin;
  label: string;
  tone?: 'default' | 'sage';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm ${
        tone === 'sage'
          ? 'border-border-success-soft bg-success-soft text-success-strong'
          : 'border-border bg-surface-raised text-ink-body'
      }`}
    >
      <Icon className={`h-4 w-4 ${tone === 'sage' ? 'text-success' : 'text-ink-muted'}`} />
      {label}
    </span>
  );
}

export function FeedJobDetail({
  job,
  onBack,
  onCheckFit,
  onGenerateKit,
  onSave,
  onDismiss,
  onRateHelpful,
  onRateNotRelevant,
  onOpenEmployerSite,
  onUpgrade,
  busy = false,
  dismissing = false,
  showCheckFit = true,
  canAffordFit = true,
  canAffordKit = true,
}: FeedJobDetailProps) {
  const age = formatJobAge(job);
  const isStrong = job.fitLabel === 'strong';
  const employerLink = safeEmployerUrl(job);
  const isSaved = Boolean(job.feedback.savedAt);
  // Dismiss and "Not relevant" both take the role out of the feed for good, so
  // each asks in place first. Only one asks at a time.
  const [confirming, setConfirming] = useState<'dismiss' | 'not_relevant' | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const hadQuestion = useRef(false);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const notRelevantRef = useRef<HTMLButtonElement>(null);
  const lastAsked = useRef<'dismiss' | 'not_relevant' | null>(null);
  const returnFocus = useRef(false);
  const rating = job.feedback.matchRating;
  const canChange = canDismissJob(job);
  // A refresh can make the role final (applied elsewhere, rated in another tab) while its question is up: then it closes.
  const asking = canChange ? confirming : null;
  if (!canChange && confirming !== null) setConfirming(null);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      (lastAsked.current === 'not_relevant' ? notRelevantRef : dismissRef).current?.focus();
    } else if (hadQuestion.current) {
      // The question closed because the role became final: its buttons are gone, so focus goes to what is left.
      saveRef.current?.focus();
    }
    hadQuestion.current = confirming !== null;
  }, [confirming]);

  const ask = (which: 'dismiss' | 'not_relevant') => {
    lastAsked.current = which;
    setConfirming(which);
  };

  const cancelConfirm = () => {
    returnFocus.current = true;
    setConfirming(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </button>
        <div className="flex-1" />
        <button
          ref={saveRef}
          type="button"
          disabled={busy}
          onClick={() => onSave(job)}
          aria-label={isSaved ? 'Remove from saved' : 'Save this role'}
          aria-pressed={isSaved}
          className={`inline-flex h-9 items-center gap-2 rounded-pill px-3 text-sm font-medium transition-colors duration-(--duration-base) hover:bg-surface cursor-pointer ${
            isSaved ? 'text-ink-accent' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Bookmark className="h-4 w-4" fill={isSaved ? 'currentColor' : 'none'} />
          {isSaved ? 'Saved' : 'Save'}
        </button>
        {employerLink && (
          <a
            href={employerLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onOpenEmployerSite(job)}
            className="inline-flex h-9 items-center gap-2 rounded-pill px-3 text-sm font-medium text-ink-muted transition-colors duration-(--duration-base) hover:bg-surface hover:text-ink cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
            Employer site
          </a>
        )}
        {asking && (
          <div
            role="group"
            aria-label={asking === 'dismiss' ? 'Dismiss this job?' : 'Not a fit?'}
            className="flex items-center gap-2"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) cancelConfirm();
            }}
          >
            <span className="text-sm font-semibold text-ink">
              {asking === 'dismiss' ? 'Dismiss this job?' : "Not a fit? It won't come back."}
            </span>
            <button
              ref={keepRef}
              type="button"
              disabled={busy}
              onClick={cancelConfirm}
              className="inline-flex h-9 items-center rounded-pill border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-resting transition-colors duration-200 hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
            >
              Keep
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => (asking === 'dismiss' ? onDismiss : onRateNotRelevant)?.(job)}
              className="inline-flex h-9 items-center rounded-pill px-3.5 text-sm font-semibold text-danger transition-colors duration-200 hover:bg-danger-soft disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
            >
              {asking === 'dismiss'
                ? (dismissing ? 'Dismissing' : 'Dismiss')
                : (dismissing ? 'Removing' : 'Not relevant')}
            </button>
          </div>
        )}
        {!asking && onRateHelpful && canChange && (
          // aria-disabled, not disabled, while it runs or once rated: a disabled button drops the focus the user just put on it.
          <button
            type="button"
            aria-disabled={busy || rating === 'helpful'}
            onClick={() => {
              if (!busy && rating !== 'helpful') onRateHelpful(job);
            }}
            className={`inline-flex h-9 items-center gap-2 rounded-pill px-3 text-sm font-medium transition-colors duration-(--duration-base) ${
              rating === 'helpful'
                ? 'cursor-default text-success-strong'
                : 'text-ink-muted hover:bg-surface hover:text-ink cursor-pointer'
            }`}
          >
            {rating === 'helpful' ? <Check className="h-4 w-4" /> : <ThumbsUp className="h-4 w-4" />}
            {rating === 'helpful' ? 'Rated a good match' : 'Good match'}
          </button>
        )}
        {!asking && onRateNotRelevant && canChange && (
          <button
            ref={notRelevantRef}
            type="button"
            disabled={busy}
            onClick={() => ask('not_relevant')}
            className="inline-flex h-9 items-center gap-2 rounded-pill px-3 text-sm font-medium text-ink-muted transition-colors duration-(--duration-base) hover:bg-surface hover:text-ink cursor-pointer"
          >
            <ThumbsDown className="h-4 w-4" />
            Not relevant
          </button>
        )}
        {!asking && onDismiss && canChange && (
          <button
            ref={dismissRef}
            type="button"
            disabled={busy}
            onClick={() => ask('dismiss')}
            className="inline-flex h-9 items-center gap-2 rounded-pill px-3 text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-surface hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
            Dismiss
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        {job.fitLabel && (
          <p className={`flex items-center gap-2 text-xs font-semibold ${isStrong ? 'text-success' : 'text-ink-accent'}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-pill ${isStrong ? 'bg-success-muted' : 'bg-accent'}`} />
            {isStrong ? 'Strong match' : 'Good match'}
          </p>
        )}
        <h2 className="mt-2 text-2xl font-semibold text-ink">{job.title}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{job.company}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {job.location && <MetaChip icon={MapPin} label={job.location} />}
          {job.workMode !== 'unknown' && <MetaChip icon={Globe} label={workModeLabel(job.workMode)} />}
          {job.salaryText && <MetaChip icon={DollarSign} label={job.salaryText} tone="sage" />}
          {age && <MetaChip icon={Clock} label={age} />}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-5">
          {!showCheckFit && (
            <p className="text-sm text-ink-muted">Open Useful Apply on a computer to check the fit and build the kit.</p>
          )}
          {showCheckFit && (
          <>
          {canAffordFit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCheckFit(job)}
              className="inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-5 text-sm font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted cursor-pointer"
            >
              <Search className="h-4 w-4" />
              Check fit
              <span className="font-medium opacity-85">· {CREDIT_COSTS.FIT_ANALYSIS} credits</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpgrade?.()}
              className="inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-5 text-sm font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-accent-strong cursor-pointer"
            >
              See Plus
              <span className="font-medium opacity-85">· {CREDIT_COSTS.FIT_ANALYSIS} credits</span>
            </button>
          )}
          {canAffordKit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerateKit(job)}
              className="text-[13px] font-medium text-brand transition-colors duration-(--duration-base) hover:text-ink disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
            >
              Skip the check, generate the kit ({CREDIT_COSTS.FULL_APPLICATION} credits)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpgrade?.()}
              className="text-[13px] font-medium text-brand transition-colors duration-(--duration-base) hover:text-ink cursor-pointer"
            >
              Upgrade to generate the kit ({CREDIT_COSTS.FULL_APPLICATION} credits)
            </button>
          )}
          </>
          )}
        </div>

        {job.matchReason && (
          <section className="mt-6">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">WHY IT&apos;S A MATCH</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-body">{job.matchReason}</p>
          </section>
        )}

        <section className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">THE AD</h3>
          <div className="mt-2 text-sm leading-relaxed text-ink-body">
            {job.description || job.highlights.length > 0 ? (
              <JobFeedDescription text={job.description} highlights={job.highlights} />
            ) : (
              <p className="text-ink-muted">
                The board didn&apos;t give us the full text for this one. Open the employer site to read it.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
