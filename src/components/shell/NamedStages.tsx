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
          className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
            stage.state === 'done'
              ? 'border-gold-200 bg-[#FBF7EE]'
              : 'border-cream-200 bg-cream-50'
          }`}
        >
          {stage.state === 'done' ? (
            <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gold-400 text-white">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          ) : stage.state === 'active' ? (
            <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-gold-500" />
          ) : (
            <span className="inline-flex h-5 w-5 flex-shrink-0 rounded-full border border-cream-200 bg-white" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium ${stage.state === 'todo' ? 'text-warm-gray' : 'text-navy-800'}`}>
              {stage.title}
            </p>
            {stage.detail ? (
              <p className="text-xs text-warm-gray">{stage.detail}</p>
            ) : null}
          </div>
          <span
            className={`text-xs font-medium ${
              stage.state === 'done'
                ? 'text-gold-600'
                : stage.state === 'active'
                  ? 'text-gold-600'
                  : 'text-warm-gray'
            }`}
          >
            {stage.state === 'done' ? 'Done' : stage.state === 'active' ? 'Now' : 'Next'}
          </span>
        </div>
      ))}
      {typeof percent === 'number' && (
        <div className="mt-1 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-cream-200">
            <div
              className="h-full bg-gold-400 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gold-600">{Math.round(percent)}%</span>
        </div>
      )}
    </div>
  );
}
