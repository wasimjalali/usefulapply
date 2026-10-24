import { Check, X, Star } from 'lucide-react';
import Link from 'next/link';
import type { ComparisonTool } from '@/lib/comparisons';

interface ComparisonDeepDiveProps {
  tool: ComparisonTool;
  isBrand?: boolean;
}

export function ComparisonDeepDive({ tool, isBrand = false }: ComparisonDeepDiveProps) {
  return (
    <div className={`bg-surface-raised rounded-card border ${isBrand ? 'border-border-accent' : 'border-border'} p-8 shadow-resting`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="font-bold text-brand text-[22px] leading-[1.15] mb-2">{tool.name}</h3>
          <p className="text-ink-muted">{tool.description}</p>
        </div>
        {tool.rating && (
          <div className="flex items-center gap-1 bg-accent-soft px-3 py-1.5 rounded-control border border-border-accent-soft">
            <Star className="w-4 h-4 text-ink-accent fill-ink-accent" />
            <span className="text-sm font-semibold text-accent-soft-ink">{tool.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Key Features */}
      {tool.keyFeatures && tool.keyFeatures.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-brand-strong uppercase tracking-wide mb-3">Key Features</h4>
          <ul className="space-y-2">
            {tool.keyFeatures.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-body">
                <Check className="w-4 h-4 text-positive mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pricing */}
      <div className="mb-6 pb-6 border-b border-subtle">
        <h4 className="text-sm font-semibold text-brand-strong uppercase tracking-wide mb-2">Pricing</h4>
        <p className="text-ink-body font-medium">{tool.pricing}</p>
      </div>

      {/* Pros & Cons */}
      <div className="grid sm:grid-cols-2 gap-6 mb-6">
        {/* Pros */}
        <div>
          <h4 className="text-sm font-semibold text-tag-green-ink uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            Pros
          </h4>
          <ul className="space-y-2">
            {tool.pros.map((pro, i) => (
              <li key={i} className="text-sm text-ink-body leading-relaxed">
                {pro}
              </li>
            ))}
          </ul>
        </div>

        {/* Cons */}
        <div>
          <h4 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <X className="w-4 h-4" />
            Cons
          </h4>
          <ul className="space-y-2">
            {tool.cons.map((con, i) => (
              <li key={i} className="text-sm text-ink-body leading-relaxed">
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Best For */}
      <div className={`${isBrand ? 'bg-accent-soft border-border-accent-soft' : 'bg-surface border-border'} border rounded-xl p-4`}>
        <h4 className="text-sm font-semibold text-brand-strong mb-2">Best For:</h4>
        <p className="text-sm text-ink-body leading-relaxed">{tool.bestFor}</p>
      </div>

      {/* CTA */}
      {isBrand && (
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-block w-full text-center px-6 py-3 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control shadow-resting transition-colors"
          >
            Start free
          </Link>
        </div>
      )}
      {!isBrand && tool.url && (
        <div className="mt-6">
          <a
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full text-center px-6 py-3 bg-canvas text-brand-strong font-semibold rounded-xl hover:bg-sunken transition-all border border-border"
          >
            Visit {tool.name}
          </a>
        </div>
      )}
    </div>
  );
}
