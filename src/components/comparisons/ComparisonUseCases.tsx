import { Target } from 'lucide-react';
import type { UseCase } from '@/lib/comparisons';

interface ComparisonUseCasesProps {
  useCases: UseCase[];
}

export function ComparisonUseCases({ useCases }: ComparisonUseCasesProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-soft rounded-pill border border-border-accent-soft mb-4">
            <Target className="w-4 h-4 text-ink-accent" />
            <span className="text-sm font-semibold text-accent-soft-ink">Choose the Right Tool</span>
          </div>
          <h2 className="font-bold text-brand text-[32px] leading-[1.1] mb-4">Which tool should you choose?</h2>
          <p className="text-ink-muted max-w-2xl mx-auto">
            Different tools excel at different things. Here&apos;s our recommendation based on your specific needs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {useCases.map((useCase, i) => (
            <div key={i} className="bg-surface-raised rounded-card border border-border p-6 shadow-resting hover:shadow-elevated transition-shadow">
              <h3 className="text-lg font-semibold text-brand mb-3">{useCase.title}</h3>
              <p className="text-sm text-ink-muted mb-4 leading-relaxed">{useCase.description}</p>
              <div className="bg-surface rounded-xl p-4 border border-border">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs font-semibold text-ink-accent uppercase tracking-wide">Recommended:</span>
                  <span className="text-sm font-semibold text-brand">{useCase.recommendedTool}</span>
                </div>
                <p className="text-xs text-ink-body leading-relaxed">{useCase.reasoning}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
