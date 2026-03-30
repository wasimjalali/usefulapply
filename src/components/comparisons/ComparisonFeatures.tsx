import { Check, Trophy } from 'lucide-react';
import type { FeatureComparison } from '@/lib/comparisons';

interface ComparisonFeaturesProps {
  features: FeatureComparison[];
  competitorName: string;
}

export function ComparisonFeatures({ features, competitorName }: ComparisonFeaturesProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-navy-700 mb-4 text-center">Feature-by-Feature Comparison</h2>
        <p className="text-warm-gray text-center mb-12 max-w-2xl mx-auto">
          We compared key capabilities to help you understand which tool fits your needs best.
        </p>

        <div className="space-y-8">
          {features.map((feature, i) => (
            <div key={i} className="bg-white rounded-2xl border border-cream-200 p-8 shadow-sm">
              {/* Feature Title */}
              <div className="flex items-start justify-between mb-6">
                <h3 className="text-xl font-bold text-navy-700">{feature.title}</h3>
                {feature.winner !== 'tie' && (
                  <div className="flex items-center gap-1.5 bg-gold-50 px-3 py-1.5 rounded-lg border border-gold-200">
                    <Trophy className="w-4 h-4 text-gold-600" />
                    <span className="text-sm font-semibold text-gold-700">
                      {feature.winner === 'karko' ? 'Karko Wins' : `${competitorName} Wins`}
                    </span>
                  </div>
                )}
                {feature.winner === 'tie' && (
                  <div className="flex items-center gap-1.5 bg-cream-50 px-3 py-1.5 rounded-lg border border-cream-200">
                    <Check className="w-4 h-4 text-charcoal" />
                    <span className="text-sm font-semibold text-charcoal">Tie</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <p className="text-warm-gray mb-6 leading-relaxed">{feature.description}</p>

              {/* Side-by-Side Details */}
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className={`rounded-xl border p-6 ${feature.winner === 'karko' ? 'bg-gold-50 border-gold-200' : 'bg-cream-50 border-cream-200'}`}>
                  <h4 className="text-sm font-semibold text-navy-700 uppercase tracking-wide mb-3">Karko AI</h4>
                  <p className="text-sm text-charcoal leading-relaxed">{feature.karkoDetails}</p>
                </div>
                <div className={`rounded-xl border p-6 ${feature.winner === 'competitor' ? 'bg-blue-50 border-blue-200' : 'bg-cream-50 border-cream-200'}`}>
                  <h4 className="text-sm font-semibold text-navy-700 uppercase tracking-wide mb-3">{competitorName}</h4>
                  <p className="text-sm text-charcoal leading-relaxed">{feature.competitorDetails}</p>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-cream-50 rounded-xl p-4 border border-cream-200">
                <h4 className="text-xs font-semibold text-navy-700 uppercase tracking-wide mb-2">Why This Matters</h4>
                <p className="text-sm text-charcoal leading-relaxed">{feature.reasoning}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
