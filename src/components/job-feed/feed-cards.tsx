'use client';

import { useEffect, useState } from 'react';
import {
  Bookmark,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';

type PendingJobAction = {
  jobId: string;
  action: 'apply' | 'save' | 'dismiss' | 'rate';
} | null;

// ============================================================================
// Helper Functions
// ============================================================================

export function fitLabelText(value: NonNullable<JobFeedFeedItem['fitLabel']>): string {
  return value === 'strong' ? 'Strong' : 'Good';
}

export function workModeLabel(value: JobFeedFeedItem['workMode']): string {
  switch (value) {
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return 'Hybrid';
    case 'onsite':
      return 'On-site';
    default:
      return 'Work mode unknown';
  }
}

export function employmentTypeLabel(value: NonNullable<JobFeedFeedItem['employmentType']>): string {
  switch (value) {
    case 'full_time':
      return 'Full-time';
    case 'part_time':
      return 'Part-time';
    case 'contract':
      return 'Contract';
    case 'internship':
      return 'Internship';
    case 'temporary':
      return 'Temporary';
    default:
      return 'Other';
  }
}

export function formatFeedDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

// ============================================================================
// Components
// ============================================================================

export function MetaPill({
  icon: Icon,
  label,
  tone = 'default',
}: {
  icon: typeof MapPin;
  label: string;
  tone?: 'default' | 'sage';
}) {
  const classes = tone === 'sage'
    ? 'border-sage-200 bg-sage-50 text-sage-700'
    : 'border-cream-200 bg-white text-charcoal';

  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${classes}`}>
      <Icon className={`h-4 w-4 ${tone === 'sage' ? 'text-sage-600' : 'text-warm-gray'}`} />
      {label}
    </span>
  );
}

export function RunStatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-white px-3 py-1.5 text-xs text-warm-gray shadow-sm">
      <span className="font-semibold text-charcoal">{label}:</span>
      {value}
    </span>
  );
}

export function JobFeedDescription({ text }: { text: string }) {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\t/g, ' ');
  const lines = normalized.split(/\n/).map((line) => line.trimEnd());
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length === 0) return;

    elements.push(
      <ul key={`list-${elements.length}`} className="my-2 ml-1 space-y-1.5">
        {currentList.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 text-navy-500">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
    currentList = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^\s*[•\-*►●○■▪–·]\s*(.+)/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1].trim());
      continue;
    }

    const trimmed = line.trim();
    const isHeader = (
      (trimmed.endsWith(':') && trimmed.length < 80) ||
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80 && /[A-Z]/.test(trimmed))
    );

    if (isHeader) {
      flushList();
      elements.push(
        <h4 key={`heading-${elements.length}`} className="mb-1.5 mt-4 font-semibold text-charcoal">
          {trimmed}
        </h4>
      );
      continue;
    }

    flushList();
    elements.push(
      <p key={`paragraph-${elements.length}`} className="mb-2">
        {trimmed}
      </p>
    );
  }

  flushList();

  return <div className="space-y-0.5">{elements}</div>;
}

function formatJobForClipboard(job: JobFeedFeedItem): string {
  const lines = [
    job.title,
    job.company,
  ];

  const metaParts: string[] = [];
  if (job.location) metaParts.push(job.location);
  if (job.workMode !== 'unknown') metaParts.push(workModeLabel(job.workMode));
  if (job.employmentType) metaParts.push(employmentTypeLabel(job.employmentType));
  if (job.salaryText) metaParts.push(job.salaryText);
  if (metaParts.length > 0) lines.push(metaParts.join(' · '));

  if (job.postedAtText) lines.push(`Posted: ${job.postedAtText}`);
  if (job.via) lines.push(`Via: ${job.via}`);

  const link = job.applyUrl || job.sourceUrl;
  if (link) lines.push(`Apply: ${link}`);

  if (job.description) {
    lines.push('', 'JOB DESCRIPTION', job.description.trim());
  }

  return lines.join('\n');
}

function CopyJobButton({
  job,
  variant = 'card',
}: {
  job: JobFeedFeedItem;
  variant?: 'card' | 'modal';
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatJobForClipboard(job));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. http context) — fail silently; user can use
      // the "Details" view and select-all manually as a fallback.
    }
  };

  const baseClass = variant === 'modal'
    ? 'inline-flex items-center gap-1.5 rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:border-navy-300 hover:text-navy-700 cursor-pointer'
    : 'inline-flex items-center gap-1 rounded-full border border-cream-200 bg-white px-2.5 py-1 text-xs font-medium text-warm-gray transition-colors hover:border-navy-200 hover:text-navy-700 cursor-pointer';

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy job details'}
      title={copied ? 'Copied' : 'Copy job details'}
      className={baseClass}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function JobFeedCard({
  job,
  isApplying,
  isAnotherJobBusy,
  onOpenDetails,
  onApplyWithKarko,
  onAnalyzeFirst,
  onExternalApply,
}: {
  job: JobFeedFeedItem;
  isApplying: boolean;
  isAnotherJobBusy: boolean;
  onOpenDetails: () => void;
  onApplyWithKarko: () => void;
  onAnalyzeFirst: () => void;
  onExternalApply: () => void;
}) {
  const isSaved = Boolean(job.feedback.savedAt);
  const isApplied = Boolean(job.feedback.appliedAt) || job.feedback.generationStatus === 'succeeded';
  const isApplyStarted = Boolean(job.feedback.applyStartedAt) && !isApplied;
  const employerLink = job.applyUrl || job.sourceUrl;
  const karkoButtonsDisabled = isApplying || isAnotherJobBusy;
  const continueLabel = isApplied || isApplyStarted;

  return (
    <div className={`rounded-2xl border p-5 transition-colors duration-200 ${
      isApplying
        ? 'border-gold-300 bg-gold-50/40 ring-1 ring-gold-200'
        : 'border-cream-200 bg-cream-50 hover:border-navy-200'
    }`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${job.fitLabel === 'strong' ? 'bg-sage-500' : 'bg-navy-400'}`} />
              <span className="text-sm font-semibold text-charcoal">
                {job.fitLabel === 'strong' ? 'Strong match' : job.fitLabel === 'good' ? 'Good match' : 'Promising match'}
              </span>
            </span>
            {isApplied ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                Application ready
              </span>
            ) : isApplyStarted ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                {job.feedback.generationStatus === 'failed' || job.feedback.generationStatus === 'cancelled'
                  ? 'Retry available'
                  : 'Application started'}
              </span>
            ) : isSaved ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-700">
                Saved
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-xl font-semibold tracking-tight text-charcoal">{job.title}</h3>
          <p className="mt-1 text-base text-warm-gray">{job.company}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <MetaPill icon={MapPin} label={job.location || 'Location not specified'} />
            <MetaPill icon={Globe} label={workModeLabel(job.workMode)} />
            {job.salaryText && <MetaPill icon={DollarSign} label={job.salaryText} tone="sage" />}
            {job.postedAtText && <MetaPill icon={Calendar} label={job.postedAtText} />}
          </div>

          {job.description && (
            <p className="mt-3 text-sm leading-6 text-charcoal line-clamp-2">
              {job.description.replace(/\s+/g, ' ').trim()}
            </p>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 lg:w-[200px]">
          <Button
            variant="gold"
            onClick={onApplyWithKarko}
            disabled={karkoButtonsDisabled}
            title={isAnotherJobBusy && !isApplying ? 'Finishing another application first…' : undefined}
          >
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isApplying ? 'Opening...' : continueLabel ? 'Continue in Karko' : 'Generate Kit'}
          </Button>

          {!continueLabel && (
            <button
              type="button"
              onClick={onAnalyzeFirst}
              disabled={karkoButtonsDisabled}
              title={isAnotherJobBusy && !isApplying ? 'Finishing another application first…' : 'Check the fit for 0.5 credits before generating'}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cream-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-navy-300 hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Target className="h-3.5 w-3.5" />
              Check fit first
            </button>
          )}

          {employerLink && (
            <a
              href={employerLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onExternalApply}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cream-300 bg-white px-4 py-2 text-sm font-medium text-charcoal transition-colors hover:border-navy-300 hover:text-navy-700"
            >
              Employer site
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onOpenDetails}
            className="py-1 text-center text-sm font-medium text-navy-600 transition-colors hover:text-navy-700 cursor-pointer"
          >
            View details
          </button>
        </div>
      </div>
    </div>
  );
}

export function JobFeedDetailModal({
  job,
  isApplying,
  isSaving,
  isDismissing,
  isRating,
  onClose,
  onApplyWithKarko,
  onAnalyzeFirst,
  onSave,
  onDismiss,
  onExternalApply,
  onRateMatch,
}: {
  job: JobFeedFeedItem;
  isApplying: boolean;
  isSaving: boolean;
  isDismissing: boolean;
  isRating: boolean;
  onClose: () => void;
  onApplyWithKarko: () => void;
  onAnalyzeFirst: () => void;
  onSave: () => void;
  onDismiss: () => void;
  onExternalApply: () => void;
  onRateMatch: (rating: 'helpful' | 'not_relevant') => void;
}) {
  const directApplyLink = job.applyUrl || job.sourceUrl;
  const isSaved = Boolean(job.feedback.savedAt);
  const isApplied = Boolean(job.feedback.appliedAt) || job.feedback.generationStatus === 'succeeded';
  const isApplyStarted = Boolean(job.feedback.applyStartedAt) && !isApplied;
  const isJobActionPending = isApplying || isSaving || isDismissing || isRating;
  const matchRating = job.feedback.matchRating;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/55 p-4 md:p-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-cream-200 bg-cream-50 px-6 py-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cream-200 bg-white text-navy-600">
            <Building2 className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${job.fitLabel === 'strong' ? 'bg-sage-500' : 'bg-navy-400'}`} />
                <span className="text-sm font-semibold text-charcoal">
                  {job.fitLabel === 'strong' ? 'Strong match' : job.fitLabel === 'good' ? 'Good match' : 'Promising match'}
                </span>
              </span>
              {isApplied ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                  Application ready
                </span>
              ) : isApplyStarted ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                  {job.feedback.generationStatus === 'failed' || job.feedback.generationStatus === 'cancelled'
                    ? 'Retry available'
                    : 'Application started'}
                </span>
              ) : isSaved ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-700">
                  Saved
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-charcoal">{job.title}</h2>
            <p className="mt-1 text-lg text-warm-gray">{job.company}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-warm-gray transition-colors hover:bg-cream-100 hover:text-charcoal cursor-pointer"
            aria-label="Close job details"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mb-6 flex flex-wrap gap-2">
            <MetaPill icon={MapPin} label={job.location || 'Location not specified'} />
            <MetaPill icon={Globe} label={workModeLabel(job.workMode)} />
            {job.salaryText && <MetaPill icon={DollarSign} label={job.salaryText} tone="sage" />}
            {job.employmentType && <MetaPill icon={Briefcase} label={employmentTypeLabel(job.employmentType)} />}
            {job.postedAtText && <MetaPill icon={Calendar} label={job.postedAtText} />}
          </div>

          {job.via && (
            <p className="mb-6 text-sm text-warm-gray">via {job.via}</p>
          )}

          {job.description ? (
            <div className="mb-6">
              <h3 className="mb-3 text-base font-semibold text-charcoal">Role details</h3>
              <div className="text-sm leading-7 text-charcoal">
                <JobFeedDescription text={job.description} />
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4 text-sm text-warm-gray">
              The provider did not include a full description for this job.
            </div>
          )}

          {job.applyOptions.length > 0 && (
            <div>
              <h3 className="mb-3 text-base font-semibold text-charcoal">Apply via</h3>
              <div className="flex flex-wrap gap-2">
                {job.applyOptions.map((option) => (
                  <a
                    key={`${option.title}-${option.link}`}
                    href={option.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-navy-50 px-4 py-2 text-sm text-navy-700 transition-colors hover:bg-navy-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {option.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Match-quality feedback. Signal is stored on job_feed_feedback so
              the ranking pipeline can consume it later to tune the user's feed. */}
          <div className="mt-6 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-charcoal">How does this match feel?</p>
                <p className="mt-0.5 text-xs text-warm-gray">Your rating helps us tune tomorrow&apos;s feed.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRateMatch('helpful')}
                  disabled={isJobActionPending}
                  aria-pressed={matchRating === 'helpful'}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed ${
                    matchRating === 'helpful'
                      ? 'border-sage-300 bg-sage-50 text-sage-700'
                      : 'border-cream-300 bg-white text-warm-gray hover:border-sage-300 hover:text-sage-700'
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Good match
                </button>
                <button
                  type="button"
                  onClick={() => onRateMatch('not_relevant')}
                  disabled={isJobActionPending}
                  aria-pressed={matchRating === 'not_relevant'}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed ${
                    matchRating === 'not_relevant'
                      ? 'border-navy-200 bg-navy-50 text-navy-700'
                      : 'border-cream-300 bg-white text-warm-gray hover:border-navy-200 hover:text-navy-700'
                  }`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Not relevant
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-cream-200 bg-cream-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {!isApplied && (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaved || isJobActionPending}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
                    isSaved
                      ? 'border-gold-300 bg-gold-50 text-gold-700'
                      : 'border-cream-300 bg-white text-charcoal hover:border-gold-300 hover:text-gold-700'
                  }`}
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
                  {isSaved ? 'Saved' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={isJobActionPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:border-navy-300 hover:text-navy-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isDismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  Dismiss
                </button>
              </>
            )}
            <CopyJobButton job={job} variant="modal" />
            {directApplyLink && (
              <a
                href={directApplyLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onExternalApply}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:border-navy-300 hover:text-navy-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Employer site
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isApplied && !isApplyStarted && (
              <button
                type="button"
                onClick={onAnalyzeFirst}
                disabled={isJobActionPending}
                title="Check the fit for 0.5 credits before generating"
                className="inline-flex items-center gap-1.5 rounded-lg border border-cream-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-navy-300 hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Target className="h-3.5 w-3.5" />
                Check fit first
              </button>
            )}
            <Button variant="gold" onClick={onApplyWithKarko} disabled={isJobActionPending}>
              {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isApplied || isApplyStarted ? 'Continue in Karko' : 'Generate Kit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedResultsCard({
  jobs,
  hasMore,
  remainingCount,
  isLoadingMore,
  pendingJobAction,
  feedSummary,
  onLoadMore,
  onOpenDetails,
  onApplyWithKarko,
  onAnalyzeFirst,
  onExternalApply,
}: {
  jobs: JobFeedFeedItem[];
  hasMore: boolean;
  remainingCount: number;
  isLoadingMore: boolean;
  pendingJobAction: PendingJobAction;
  feedSummary: string;
  onLoadMore: () => void;
  onOpenDetails: (job: JobFeedFeedItem) => void;
  onApplyWithKarko: (job: JobFeedFeedItem) => void;
  onAnalyzeFirst: (job: JobFeedFeedItem) => void;
  onExternalApply: (job: JobFeedFeedItem) => void;
}) {
  const applyingJobId = pendingJobAction?.action === 'apply' ? pendingJobAction.jobId : null;

  return (
    <Card className="rounded-2xl border-cream-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-warm-gray">{feedSummary}</p>

      <div className="mt-5 space-y-4">
        {jobs.map((job) => (
          <JobFeedCard
            key={job.id}
            job={job}
            isApplying={applyingJobId === job.id}
            isAnotherJobBusy={Boolean(applyingJobId) && applyingJobId !== job.id}
            onOpenDetails={() => onOpenDetails(job)}
            onApplyWithKarko={() => onApplyWithKarko(job)}
            onAnalyzeFirst={() => onAnalyzeFirst(job)}
            onExternalApply={() => onExternalApply(job)}
          />
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 bg-white px-5 py-2 text-sm font-semibold text-navy-700 shadow-sm transition-colors hover:border-navy-300 hover:bg-cream-50 disabled:opacity-60 cursor-pointer"
          >
            <ChevronDown className="h-4 w-4" />
            {isLoadingMore ? 'Loading…' : `Load more (${remainingCount})`}
          </button>
        </div>
      )}
    </Card>
  );
}
