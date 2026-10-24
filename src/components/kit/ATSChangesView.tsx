'use client';

import { ArrowLeft, Check, Shield } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';

interface ATSChangesViewProps {
  onBack: () => void;
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function countLabel(n: number, noun: string): string {
  const word = n <= 10 ? COUNT_WORDS[n] : String(n);
  return `${word} ${n === 1 ? noun : `${noun}s`}`;
}

/** Splits "Headline: leads with X" into a title and a reason when the change is written that way. */
function splitChange(text: string): { title: string | null; reason: string } {
  const m = text.match(/^([A-Z][A-Za-z &/]{1,28}?):\s+(.+)$/);
  if (m) return { title: m[1], reason: m[2] };
  return { title: null, reason: text };
}

export function ATSChangesView({ onBack }: ATSChangesViewProps) {
  const currentSession = useSessionStore((s) => s.currentSession);
  const analysis = currentSession?.optimizedCVData?.analysis;
  const legacyChanges = currentSession?.generatedCV?.changes ?? [];
  const company = currentSession?.company || '';
  const score = analysis?.ats_compatibility ?? null;
  const gaps = currentSession?.missingSkills ?? [];
  const keywords = analysis?.missing_keywords_added ?? [];

  // Before/after pairs only exist on the legacy changes payload. The structured
  // analysis carries one line per change, so those cards show the reason alone.
  const cards: Array<{ title: string | null; reason: string; before?: string; after?: string }> =
    legacyChanges.length > 0
      ? legacyChanges.map((c) => ({
          title: c.section || null,
          reason: c.reason,
          before: c.original || undefined,
          after: c.updated || undefined,
        }))
      : (analysis?.key_changes ?? []).map(splitChange);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-4 border-b border-border px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-resting hover:bg-surface-raised cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CV
        </button>
        <h2 className="text-lg font-semibold text-ink">What changed in your CV</h2>
        <div className="flex-1" />
        {score !== null && (
          <span className="inline-flex h-9 items-center gap-2 rounded-pill bg-success-soft px-3 text-[13px] font-semibold text-success-strong">
            <Shield className="h-3.5 w-3.5" />
            ATS {score}%
            {company ? <span className="font-medium opacity-80">· {company} ad</span> : null}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="mx-auto flex max-w-[620px] flex-col gap-4">
          <div className="rounded-card border border-border bg-surface p-5 shadow-resting">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-ink">ATS compatibility</span>
              {score !== null && (
                <span className="text-2xl font-semibold text-ink">{score}%</span>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-sunken">
              <div className="h-full rounded-pill bg-accent" style={{ width: `${score ?? 0}%` }} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {analysis?.summary ? `${analysis.summary.trim().replace(/\.?$/, '.')} ` : ''}
              {countLabel(cards.length, 'change')}, nothing added.
            </p>
          </div>

          {cards.map((card, i) => (
            <div key={`${card.title ?? 'change'}-${i}`} className="rounded-card border border-border bg-surface-raised p-5 shadow-resting">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-pill bg-accent-soft-strong text-accent-soft-ink">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <p className="text-sm leading-relaxed text-ink-body">
                  {card.title ? <span className="font-semibold text-ink">{card.title} </span> : null}
                  <span className="text-ink-muted">{card.reason}</span>
                </p>
              </div>
              {card.before && card.after && (
                <div className="mt-3 grid grid-cols-2 gap-4 pl-8">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Before</p>
                    <p className="mt-1 text-sm text-ink-muted line-through decoration-ink-ghost">{card.before}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-success-strong">After</p>
                    <p className="mt-1 rounded-control bg-success-soft px-3 py-2 text-sm text-ink-body">{card.after}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {cards.length === 0 && (
            <p className="text-sm text-ink-muted">The change list for this CV wasn&apos;t saved. The score above still stands.</p>
          )}

          {keywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <span className="mr-1 text-xs text-ink-muted">Matched from the ad, already in your CV:</span>
              {keywords.map((k) => (
                <span key={k} className="rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-soft-ink">
                  {k}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 rounded-control bg-success-soft px-4 py-3 text-sm text-success-strong">
            <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-pill bg-surface-raised">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <p>
              <span className="font-semibold">Nothing added.</span>{' '}
              {gaps.length > 0
                ? `${gaps.join(', ')} ${gaps.length === 1 ? 'stays a gap' : 'stay gaps'}. No invented skills, no invented numbers.`
                : 'No invented skills, no invented numbers.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
