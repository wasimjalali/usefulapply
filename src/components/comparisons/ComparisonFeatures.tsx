import { Check, Trophy } from 'lucide-react';
import type { FeatureComparison } from '@/lib/comparisons';

interface ComparisonFeaturesProps {
  features: FeatureComparison[];
  competitorName: string;
}

export function ComparisonFeatures({ features, competitorName }: ComparisonFeaturesProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-bold text-brand text-[32px] leading-[1.1] mb-4 text-center">Feature-by-feature comparison.</h2>
        <p className="text-ink-muted text-center mb-12 max-w-2xl mx-auto">
          We compared key capabilities to help you understand which tool fits your needs best.
        </p>

        <div className="space-y-8">
          {features.map((feature, i) => (
            <div key={i} className="bg-surface-raised rounded-card border border-border p-8 shadow-resting">
              {/* Feature Title */}
              <div className="flex items-start justify-between mb-6">
                <h3 className="text-xl font-semibold text-brand">{feature.title}</h3>
                {feature.winner !== 'tie' && (
                  <div className="flex items-center gap-1.5 bg-accent-soft px-3 py-1.5 rounded-control border border-border-accent-soft">
                    <Trophy className="w-4 h-4 text-ink-accent" />
                    <span className="text-sm font-semibold text-accent-soft-ink">
                      {feature.winner === 'brand' ? 'Useful Apply Wins' : `${competitorName} Wins`}
                    </span>
                  </div>
                )}
                {feature.winner === 'tie' && (
                  <div className="flex items-center gap-1.5 bg-surface px-3 py-1.5 rounded-control border border-border">
                    <Check className="w-4 h-4 text-ink-body" />
                    <span className="text-sm font-semibold text-ink-body">Tie</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <p className="text-ink-muted mb-6 leading-relaxed">{feature.description}</p>

              {/* Side-by-Side Details */}
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className={`rounded-xl border p-6 ${feature.winner === 'brand' ? 'bg-accent-soft border-border-accent-soft' : 'bg-surface border-border'}`}>
                  <h4 className="text-sm font-semibold text-brand-strong uppercase tracking-wide mb-3">Useful Apply</h4>
                  <p className="text-sm text-ink-body leading-relaxed">{feature.brandDetails}</p>
                </div>
                <div className={`rounded-xl border p-6 ${feature.winner === 'competitor' ? 'bg-tag-blue-soft border-tag-blue-line' : 'bg-surface border-border'}`}>
                  <h4 className="text-sm font-semibold text-brand-strong uppercase tracking-wide mb-3">{competitorName}</h4>
                  <p className="text-sm text-ink-body leading-relaxed">{feature.competitorDetails}</p>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-surface rounded-xl p-4 border border-border">
                <h4 className="text-xs font-semibold text-brand-strong uppercase tracking-wide mb-2">Why This Matters</h4>
                <p className="text-sm text-ink-body leading-relaxed">{feature.reasoning}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
