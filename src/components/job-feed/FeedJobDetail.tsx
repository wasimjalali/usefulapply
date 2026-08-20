'use client';

import { ArrowLeft, Bookmark, Clock, DollarSign, ExternalLink, Globe, MapPin, Search } from 'lucide-react';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { JobFeedDescription, workModeLabel } from './job-ad-text';
import { formatJobAge, safeEmployerUrl } from './feed-format';
import { CREDIT_COSTS } from '@/lib/credit-costs';

interface FeedJobDetailProps {
  job: JobFeedFeedItem;
  onBack: () => void;
  onCheckFit: (job: JobFeedFeedItem) => void;
  onGenerateKit: (job: JobFeedFeedItem) => void;
  onSave: (job: JobFeedFeedItem) => void;
  onOpenEmployerSite: (job: JobFeedFeedItem) => void;
  onUpgrade?: () => void;
  busy?: boolean;
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
        tone === 'sage'
          ? 'border-sage-200 bg-sage-50 text-sage-700'
          : 'border-cream-200 bg-white text-charcoal'
      }`}
    >
      <Icon className={`h-4 w-4 ${tone === 'sage' ? 'text-sage-600' : 'text-warm-gray'}`} />
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
  onOpenEmployerSite,
  onUpgrade,
  busy = false,
  showCheckFit = true,
  canAffordFit = true,
  canAffordKit = true,
}: FeedJobDetailProps) {
  const age = formatJobAge(job);
  const isStrong = job.fitLabel === 'strong';
  const employerLink = safeEmployerUrl(job);
  const isSaved = Boolean(job.feedback.savedAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-cream-200 px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(job)}
          aria-label={isSaved ? 'Remove from saved' : 'Save this role'}
          aria-pressed={isSaved}
          className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors duration-200 hover:bg-cream-50 cursor-pointer ${
            isSaved ? 'text-gold-600' : 'text-warm-gray hover:text-navy-800'
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
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-warm-gray transition-colors duration-200 hover:bg-cream-50 hover:text-navy-800 cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
            Employer site
          </a>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        {job.fitLabel && (
          <p className={`flex items-center gap-2 text-xs font-semibold ${isStrong ? 'text-sage-600' : 'text-gold-600'}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${isStrong ? 'bg-sage-500' : 'bg-gold-400'}`} />
            {isStrong ? 'Strong match' : 'Good match'}
          </p>
        )}
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-800">{job.title}</h2>
        <p className="mt-0.5 text-sm text-warm-gray">{job.company}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {job.location && <MetaChip icon={MapPin} label={job.location} />}
          {job.workMode !== 'unknown' && <MetaChip icon={Globe} label={workModeLabel(job.workMode)} />}
          {job.salaryText && <MetaChip icon={DollarSign} label={job.salaryText} tone="sage" />}
          {age && <MetaChip icon={Clock} label={age} />}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-cream-200 pt-5">
          {!showCheckFit && (
            <p className="text-sm text-warm-gray">Open Useful Apply on a computer to check the fit and build the kit.</p>
          )}
          {showCheckFit && (
          <>
          {canAffordFit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCheckFit(job)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gold-400 px-5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 disabled:cursor-not-allowed disabled:bg-cream-200 disabled:text-warm-gray cursor-pointer"
            >
              <Search className="h-4 w-4" />
              Check fit
              <span className="font-medium opacity-85">· {CREDIT_COSTS.FIT_ANALYSIS} credits</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpgrade?.()}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gold-400 px-5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 cursor-pointer"
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
              className="text-[13px] font-medium text-navy-600 transition-colors duration-200 hover:text-navy-800 disabled:cursor-not-allowed disabled:text-warm-gray cursor-pointer"
            >
              Skip the check, generate the kit ({CREDIT_COSTS.FULL_APPLICATION} credits)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpgrade?.()}
              className="text-[13px] font-medium text-navy-600 transition-colors duration-200 hover:text-navy-800 cursor-pointer"
            >
              Upgrade to generate the kit ({CREDIT_COSTS.FULL_APPLICATION} credits)
            </button>
          )}
          </>
          )}
        </div>

        {job.matchReason && (
          <section className="mt-6">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-warm-gray">WHY IT&apos;S A MATCH</h3>
            <p className="mt-2 text-sm leading-relaxed text-charcoal">{job.matchReason}</p>
          </section>
        )}

        <section className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.08em] text-warm-gray">THE AD</h3>
          <div className="mt-2 text-sm leading-relaxed text-charcoal">
            {job.description || job.highlights.length > 0 ? (
              <JobFeedDescription text={job.description} highlights={job.highlights} />
            ) : (
              <p className="text-warm-gray">
                The board didn&apos;t give us the full text for this one. Open the employer site to read it.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
