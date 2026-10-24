'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Clock, DollarSign, ExternalLink, Globe, MapPin, Search, X } from 'lucide-react';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { workModeLabel } from './job-ad-text';
import { buildCardSummary, formatJobAge, safeEmployerUrl } from './feed-format';
import { CREDIT_COSTS } from '@/lib/credit-costs';

interface FeedJobCardProps {
  job: JobFeedFeedItem;
  onOpenDetail: (job: JobFeedFeedItem) => void;
  onCheckFit: (job: JobFeedFeedItem) => void;
  onSave: (job: JobFeedFeedItem) => void;
  /** Left out where dismissing isn't allowed (the Free plan), so the icon doesn't show. */
  onDismiss?: (job: JobFeedFeedItem) => void;
  onOpenEmployerSite: (job: JobFeedFeedItem) => void;
  onUpgrade?: () => void;
  busy?: boolean;
  /** False on the mobile read-only feed, where the kit cannot be generated. */
  showCheckFit?: boolean;
  canAffordFit?: boolean;
}

function MetaChip({ icon: Icon, label, tone = 'default' }: {
  icon: typeof MapPin;
  label: string;
  tone?: 'default' | 'sage';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        tone === 'sage'
          ? 'border-sage-200 bg-sage-50 text-sage-700'
          : 'border-cream-200 bg-white text-charcoal'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${tone === 'sage' ? 'text-sage-600' : 'text-warm-gray'}`} />
      {label}
    </span>
  );
}

export function FeedJobCard({
  job,
  onOpenDetail,
  onCheckFit,
  onSave,
  onDismiss,
  onOpenEmployerSite,
  onUpgrade,
  busy = false,
  showCheckFit = true,
  canAffordFit = true,
}: FeedJobCardProps) {
  const age = formatJobAge(job);
  const summary = buildCardSummary(job);
  const isStrong = job.fitLabel === 'strong';
  const employerLink = safeEmployerUrl(job);
  const isSaved = Boolean(job.feedback.savedAt);
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDismiss) keepRef.current?.focus();
  }, [confirmingDismiss]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(job)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetail(job);
        }
      }}
      className={`w-full cursor-pointer rounded-2xl border bg-cream-50 px-5 py-4 text-left shadow-sm transition-colors duration-200 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 ${
        isStrong ? 'border-gold-200' : 'border-cream-200'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {job.fitLabel && (
            <p className={`flex items-center gap-2 text-xs font-semibold ${isStrong ? 'text-sage-600' : 'text-gold-600'}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${isStrong ? 'bg-sage-500' : 'bg-gold-400'}`} />
              {isStrong ? 'Strong match' : 'Good match'}
            </p>
          )}
          <h3 className="mt-1.5 truncate text-lg font-semibold text-navy-800">{job.title}</h3>
          <p className="text-sm text-warm-gray">{job.company}</p>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          {showCheckFit && (
            canAffordFit ? (
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  onCheckFit(job);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-gold-400 px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 disabled:cursor-not-allowed disabled:bg-cream-200 disabled:text-warm-gray cursor-pointer"
              >
                <Search className="h-4 w-4" />
                Check fit
                <span className="font-medium opacity-85">· {CREDIT_COSTS.FIT_ANALYSIS}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUpgrade?.();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-gold-400 px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 cursor-pointer"
              >
                See Plus
              </button>
            )
          )}
          {confirmingDismiss ? (
            <div
              role="group"
              aria-label="Dismiss this job?"
              className="flex flex-wrap items-center justify-end gap-2"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape' && !busy) setConfirmingDismiss(false);
              }}
            >
              <span className="text-xs font-semibold text-ink">Dismiss this job?</span>
              <button
                ref={keepRef}
                type="button"
                disabled={busy}
                onClick={() => setConfirmingDismiss(false)}
                className="inline-flex h-8 items-center rounded-pill border border-border bg-surface px-3 text-xs font-semibold text-ink shadow-resting transition-colors duration-200 hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDismiss?.(job)}
                className="inline-flex h-8 items-center rounded-pill px-3 text-xs font-semibold text-danger transition-colors duration-200 hover:bg-canvas disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
              >
                {busy ? 'Dismissing' : 'Dismiss'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  onSave(job);
                }}
                aria-label={isSaved ? 'Remove from saved' : 'Save this role'}
                aria-pressed={isSaved}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 hover:bg-cream-100 cursor-pointer ${
                  isSaved ? 'text-gold-600' : 'text-warm-gray hover:text-navy-700'
                }`}
              >
                <Bookmark className="h-4 w-4" fill={isSaved ? 'currentColor' : 'none'} />
              </button>
              {employerLink && (
                <a
                  href={employerLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenEmployerSite(job);
                  }}
                  aria-label="Open the employer site"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-warm-gray transition-colors duration-200 hover:bg-cream-100 hover:text-navy-700 cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {onDismiss && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmingDismiss(true);
                  }}
                  aria-label="Dismiss this role"
                  title="Dismiss"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-muted transition-colors duration-200 hover:bg-canvas hover:text-brand-strong cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {job.location && <MetaChip icon={MapPin} label={job.location} />}
        {job.workMode !== 'unknown' && <MetaChip icon={Globe} label={workModeLabel(job.workMode)} />}
        {job.salaryText && <MetaChip icon={DollarSign} label={job.salaryText} tone="sage" />}
        {age && <MetaChip icon={Clock} label={age} />}
      </div>

      {summary && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-charcoal">{summary}</p>
      )}
      <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-navy-700">
        Details
        <span aria-hidden="true">→</span>
      </span>
    </div>
  );
}
