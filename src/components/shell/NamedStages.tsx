'use client';

import { Check, Loader2 } from 'lucide-react';

export type StageState = 'done' | 'active' | 'todo';

export interface NamedStage {
  title: string;
  detail?: string;
  state: StageState;
}

interface NamedStagesProps {
  stages: NamedStage[];
  percent?: number;
}

export function NamedStages({ stages, percent }: NamedStagesProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {stages.map((stage) => (
        <div
          key={stage.title}
          className={`flex items-center gap-3 rounded-control border px-3.5 py-3 ${
            stage.state === 'done'
              ? 'border-border-accent-soft bg-accent-soft'
              : 'border-border bg-surface'
          }`}
        >
          {stage.state === 'done' ? (
            <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-pill bg-accent text-accent-ink">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          ) : stage.state === 'active' ? (
            <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-accent-strong" />
          ) : (
            <span className="inline-flex h-5 w-5 flex-shrink-0 rounded-pill border border-border bg-surface-raised" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium ${stage.state === 'todo' ? 'text-ink-muted' : 'text-ink'}`}>
              {stage.title}
            </p>
            {stage.detail ? (
              <p className="text-xs text-ink-muted">{stage.detail}</p>
            ) : null}
          </div>
          <span
            className={`text-xs font-medium ${
              stage.state === 'done'
                ? 'text-ink-accent'
                : stage.state === 'active'
                  ? 'text-ink-accent'
                  : 'text-ink-muted'
            }`}
          >
            {stage.state === 'done' ? 'Done' : stage.state === 'active' ? 'Now' : 'Next'}
          </span>
        </div>
      ))}
      {typeof percent === 'number' && (
        <div className="mt-1 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-pill bg-sunken">
            <div
              className="h-full bg-accent transition-all duration-(--duration-base)"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
          <span className="text-xs font-medium text-ink-accent">{Math.round(percent)}%</span>
        </div>
      )}
    </div>
  );
}
