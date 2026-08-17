'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
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
  MessageSquareText,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { JobFeedFeedItem, JobFeedHighlight } from '@/lib/job-feed/types';
import {
  getJobFeedCardActions,
  type JobFeedCardAction,
  type JobFeedCardActionKind,
  type JobFeedCardSessionState,
} from './feed-card-actions';

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

// Common section headers job boards use. When a description arrives as one
// run-on blob (no line breaks), we put these on their own line so the line
// parser below can turn them into real headings + bullet lists. No lookbehind
// (older Safari throws on it at parse time, which would crash this component).
const INLINE_SECTION_HEADERS = /\s*\b(Key Responsibilities|Responsibilities|Minimum Qualifications|Preferred Qualifications|Qualifications|Requirements|What You'?ll Do|What You Will Do|What We Offer|What You Bring|What We're Looking For|Who You Are|Your Role|Your Profile|About The Role|About You|About Us|Benefits|Perks|Nice To Have|Compensation)\s*:/gi;

interface ParsedDescription {
  nodes: React.ReactNode[];
  /** True when the text produced real structure (a list, a heading, or more
   *  than one paragraph). False for a single run-on paragraph. */
  structured: boolean;
}

function parseDescriptionText(text: string): ParsedDescription {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\t/g, ' ')
    // Break a run-on blob around known section headers so it segments even
    // without source line breaks: header on its own line (so it renders as a
    // heading), content on the next.
    .replace(INLINE_SECTION_HEADERS, (_match, header: string) => `\n\n${header}:\n`);

  const lines = normalized.split(/\n/).map((line) => line.trimEnd());
  const nodes: React.ReactNode[] = [];
  let currentList: string[] = [];
  let listCount = 0;
  let headingCount = 0;
  let paragraphCount = 0;

  const flushList = () => {
    if (currentList.length === 0) return;
    const items = currentList;
    listCount += 1;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="my-2 ml-1 space-y-1.5">
        {items.map((item, index) => (
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
      headingCount += 1;
      nodes.push(
        <h4 key={`heading-${nodes.length}`} className="mb-1.5 mt-4 font-semibold text-charcoal">
          {trimmed}
        </h4>
      );
      continue;
    }

    flushList();
    paragraphCount += 1;
    nodes.push(
      <p key={`paragraph-${nodes.length}`} className="mb-2">
        {trimmed}
      </p>
    );
  }

  flushList();

  return { nodes, structured: listCount > 0 || headingCount > 0 || paragraphCount > 1 };
}

function HighlightSections({ highlights }: { highlights: JobFeedHighlight[] }) {
  return (
    <div className="space-y-4">
      {highlights.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {section.title && (
            <h4 className="mb-1.5 font-semibold text-charcoal">{section.title}</h4>
          )}
          <ul className="ml-1 space-y-1.5">
            {section.items.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 text-navy-500">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function JobFeedDescription({
  text,
  highlights = [],
}: {
  text: string | null;
  highlights?: JobFeedHighlight[];
}) {
  const parsed = text ? parseDescriptionText(text) : { nodes: [], structured: false };
  const usableHighlights = highlights.filter((section) => section.items.length > 0);

  // The free-text description already reads as structured sections — trust it.
  if (parsed.structured) {
    return <div className="space-y-0.5">{parsed.nodes}</div>;
  }

  // Run-on blob (or empty). If the provider gave structured highlights, render
  // those as clean sections, with the flat text kept as a lead-in when present.
  if (usableHighlights.length > 0) {
    return (
      <div className="space-y-4">
        {parsed.nodes.length > 0 && <div className="space-y-0.5">{parsed.nodes}</div>}
        <HighlightSections highlights={usableHighlights} />
      </div>
    );
  }

  // Nothing better available — render the flat text as-is.
  return <div className="space-y-0.5">{parsed.nodes}</div>;
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

function JobFeedActionButton({
  action,
  disabled,
  isApplying,
  onClick,
}: {
  action: JobFeedCardAction;
  disabled: boolean;
  isApplying: boolean;
  onClick: () => void;
}) {
  const Icon =
    action.kind === 'check-fit' ? Target :
    action.kind === 'screening' ? MessageSquareText :
    action.kind === 'skip-screening' || action.kind === 'new-search' ? X :
    action.kind === 'continue' ? ArrowRight :
    Zap;
  const label = isApplying ? 'Opening...' : action.label;
  const title =
    action.kind === 'check-fit'
      ? 'Check the fit for 0.5 credits before generating'
      : action.kind === 'screening'
        ? 'Ask Useful Apply to draft answers for screening questions'
        : action.kind === 'new-search'
          ? 'Start a different application in Useful Apply'
          : undefined;

  if (action.variant === 'gold') {
    return (
      <Button
        variant="gold"
        onClick={onClick}
        disabled={disabled}
        title={title}
      >
        {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
        {label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cream-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-navy-300 hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function JobFeedActionControls({
  actions,
  disabled,
  isApplying,
  onAction,
}: {
  actions: ReturnType<typeof getJobFeedCardActions>;
  disabled: boolean;
  isApplying: boolean;
  onAction: (action: JobFeedCardActionKind) => void;
}) {
  const orderedActions: JobFeedCardAction[] = actions.secondary
    ? actions.leadWithSecondary
      ? [actions.secondary, actions.primary]
      : [actions.primary, actions.secondary]
    : [actions.primary];

  return (
    <>
      {orderedActions.map((action) => (
        <JobFeedActionButton
          key={action.kind}
          action={action}
          disabled={disabled}
          isApplying={isApplying}
          onClick={() => onAction(action.kind)}
        />
      ))}
    </>
  );
}

export function JobFeedCard({
  job,
  session,
  isApplying,
  isAnotherJobBusy,
  isFreeUser,
  onOpenDetails,
  onAction,
  onExternalApply,
}: {
  job: JobFeedFeedItem;
  session: JobFeedCardSessionState | null;
  isApplying: boolean;
  isAnotherJobBusy: boolean;
  isFreeUser: boolean;
  onOpenDetails: () => void;
  onAction: (action: JobFeedCardActionKind) => void;
  onExternalApply: () => void;
}) {
  const isSaved = Boolean(job.feedback.savedAt);
  const employerLink = job.applyUrl || job.sourceUrl;
  const applyButtonsDisabled = isApplying || isAnotherJobBusy;
  const cardActions = getJobFeedCardActions({
    feedback: job.feedback,
    session,
    isFreeUser,
    fitLabel: job.fitLabel,
  });

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
            {cardActions.badge ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                {cardActions.badge}
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
          <JobFeedActionControls
            actions={cardActions}
            disabled={applyButtonsDisabled}
            isApplying={isApplying}
            onAction={onAction}
          />

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
  session,
  isApplying,
  isSaving,
  isDismissing,
  isRating,
  isFreeUser,
  onClose,
  onAction,
  onSave,
  onDismiss,
  onExternalApply,
  onRateMatch,
}: {
  job: JobFeedFeedItem;
  session: JobFeedCardSessionState | null;
  isApplying: boolean;
  isSaving: boolean;
  isDismissing: boolean;
  isRating: boolean;
  isFreeUser: boolean;
  onClose: () => void;
  onAction: (action: JobFeedCardActionKind) => void;
  onSave: () => void;
  onDismiss: () => void;
  onExternalApply: () => void;
  onRateMatch: (rating: 'helpful' | 'not_relevant') => void;
}) {
  const directApplyLink = job.applyUrl || job.sourceUrl;
  const isSaved = Boolean(job.feedback.savedAt);
  const isApplied = Boolean(job.feedback.appliedAt) || job.feedback.generationStatus === 'succeeded';
  const isJobActionPending = isApplying || isSaving || isDismissing || isRating;
  const matchRating = job.feedback.matchRating;
  const cardActions = getJobFeedCardActions({
    feedback: job.feedback,
    session,
    isFreeUser,
    fitLabel: job.fitLabel,
  });

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
              {cardActions.badge ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                  {cardActions.badge}
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

          {(job.description || job.highlights.length > 0) ? (
            <div className="mb-6">
              <h3 className="mb-3 text-base font-semibold text-charcoal">Role details</h3>
              <div className="text-sm leading-7 text-charcoal">
                <JobFeedDescription text={job.description} highlights={job.highlights} />
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
            <JobFeedActionControls
              actions={cardActions}
              disabled={isJobActionPending}
              isApplying={isApplying}
              onAction={onAction}
            />
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
  isFreeUser,
  getSessionForJob,
  onLoadMore,
  onOpenDetails,
  onJobAction,
  onExternalApply,
}: {
  jobs: JobFeedFeedItem[];
  hasMore: boolean;
  remainingCount: number;
  isLoadingMore: boolean;
  pendingJobAction: PendingJobAction;
  feedSummary: string;
  isFreeUser: boolean;
  getSessionForJob: (job: JobFeedFeedItem) => JobFeedCardSessionState | null;
  onLoadMore: () => void;
  onOpenDetails: (job: JobFeedFeedItem) => void;
  onJobAction: (job: JobFeedFeedItem, action: JobFeedCardActionKind) => void;
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
            session={getSessionForJob(job)}
            isApplying={applyingJobId === job.id}
            isAnotherJobBusy={Boolean(applyingJobId) && applyingJobId !== job.id}
            isFreeUser={isFreeUser}
            onOpenDetails={() => onOpenDetails(job)}
            onAction={(action) => onJobAction(job, action)}
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
