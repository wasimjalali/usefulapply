'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Check, Loader2, Search, Filter, Sparkles, ListChecks } from 'lucide-react';

const STAGES = [
  {
    id: 'search',
    label: 'Searching job boards',
    detail: 'Pulling fresh listings that match your preferences.',
    icon: Search,
    // Rough mid-point of this stage in seconds since the run started.
    completeBy: 20,
  },
  {
    id: 'filter',
    label: 'Filtering for your fit',
    detail: 'Removing duplicates and off-target roles.',
    icon: Filter,
    completeBy: 40,
  },
  {
    id: 'rank',
    label: 'Ranking with AI',
    detail: 'Reading each description to pick the strongest matches.',
    icon: Sparkles,
    completeBy: 90,
  },
  {
    id: 'prepare',
    label: 'Preparing your feed',
    detail: 'Saving picks and dedupe rules for the 7-day inbox.',
    icon: ListChecks,
    completeBy: 120,
  },
] as const;

type StageState = 'pending' | 'in_progress' | 'done';

export function SmartFeedProgressCard({ startedAt }: { startedAt: string | null }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const startedMs = Date.parse(startedAt);
    if (Number.isNaN(startedMs)) return;

    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const stageStates: StageState[] = STAGES.map((stage, index) => {
    if (elapsedSeconds >= stage.completeBy) return 'done';
    // The first stage whose completeBy hasn't been reached is in progress.
    const earlierStagesDone = STAGES.slice(0, index).every((s) => elapsedSeconds >= s.completeBy);
    return earlierStagesDone ? 'in_progress' : 'pending';
  });

  const displaySeconds = Math.min(elapsedSeconds, 180);
  const elapsedLabel = displaySeconds < 60
    ? `${displaySeconds}s elapsed`
    : `${Math.floor(displaySeconds / 60)}m ${displaySeconds % 60}s elapsed`;

  return (
    <Card className="flex min-h-[320px] flex-col rounded-2xl border-cream-200 bg-white px-6 py-8 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-50 text-gold-700">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-charcoal">
            Your Smart Feed is being built
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-warm-gray">
            Usually takes 1 to 2 minutes. You can keep working in other panels, we&apos;ll save your feed when it&apos;s done.
          </p>
          <p className="mt-1.5 text-xs font-medium text-navy-600">
            {elapsedLabel}
          </p>
        </div>
      </div>

      <ol className="mt-7 space-y-3.5">
        {STAGES.map((stage, index) => {
          const state = stageStates[index];
          const Icon = stage.icon;
          return (
            <li
              key={stage.id}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                state === 'done'
                  ? 'border-cream-200 bg-cream-50'
                  : state === 'in_progress'
                    ? 'border-gold-200 bg-gold-50/60'
                    : 'border-cream-200 bg-white'
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  state === 'done'
                    ? 'bg-gold-400 text-navy-900'
                    : state === 'in_progress'
                      ? 'bg-navy-50 text-navy-700'
                      : 'bg-cream-100 text-warm-gray'
                }`}
              >
                {state === 'done' ? (
                  <Check className="h-4 w-4" />
                ) : state === 'in_progress' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    state === 'pending' ? 'text-warm-gray' : 'text-charcoal'
                  }`}
                >
                  {stage.label}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-warm-gray">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
