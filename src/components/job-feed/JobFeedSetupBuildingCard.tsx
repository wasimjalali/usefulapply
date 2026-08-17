'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Check, FileText, Loader2, Sparkles, Search } from 'lucide-react';

const STAGES = [
  {
    id: 'cv',
    label: 'Reading your CV',
    detail: 'Pulling roles, skills, and experience from your primary CV.',
    icon: FileText,
    completeBy: 5,
  },
  {
    id: 'profile',
    label: 'Inferring your search profile',
    detail: 'Synthesizing your titles, seniority, and skill clusters.',
    icon: Sparkles,
    completeBy: 12,
  },
  {
    id: 'strategy',
    label: 'Planning your search',
    detail: 'Picking the right keywords for each market you chose.',
    icon: Search,
    completeBy: 22,
  },
] as const;

type StageState = 'pending' | 'in_progress' | 'done';

/**
 * Shown right after a first-time user saves their preferences. Stages cover
 * the AI work happening in the background: CV read, profile synthesis,
 * strategy generation. The actual sub-tasks complete async, so this is a
 * time-based progress estimator like SmartFeedProgressCard, not real
 * status. Total walltime is normally 15-25s end-to-end.
 */
export function JobFeedSetupBuildingCard() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  const stageStates: StageState[] = STAGES.map((stage, index) => {
    if (elapsedSeconds >= stage.completeBy) return 'done';
    const earlierStagesDone = STAGES.slice(0, index).every((s) => elapsedSeconds >= s.completeBy);
    return earlierStagesDone ? 'in_progress' : 'pending';
  });

  return (
    <Card className="overflow-hidden rounded-2xl border-cream-200 bg-cream-50 p-0 shadow-sm">
      <div className="px-6 py-7 sm:px-8 sm:py-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl font-semibold tracking-tight text-charcoal">
              Building your AI feed
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-warm-gray">
              Useful Apply is reading your CV, inferring your profile, and planning your search. Usually 15 to 25 seconds.
            </p>
          </div>
        </div>

        <ol className="mt-7 space-y-2.5">
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
                      ? 'bg-gold-400 text-white'
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
                  <p className={`text-sm font-semibold ${state === 'pending' ? 'text-warm-gray' : 'text-charcoal'}`}>
                    {stage.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-warm-gray">{stage.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
