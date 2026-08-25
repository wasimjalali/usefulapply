import { Check, X, Star } from 'lucide-react';
import Link from 'next/link';
import type { ComparisonTool } from '@/lib/comparisons';

interface ComparisonDeepDiveProps {
  tool: ComparisonTool;
  isBrand?: boolean;
}

export function ComparisonDeepDive({ tool, isBrand = false }: ComparisonDeepDiveProps) {
  return (
    <div className={`bg-white rounded-2xl border ${isBrand ? 'border-gold-300' : 'border-cream-200'} p-8 shadow-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="font-bold text-navy-600 text-[22px] leading-[1.15] mb-2">{tool.name}</h3>
          <p className="text-warm-gray">{tool.description}</p>
        </div>
        {tool.rating && (
          <div className="flex items-center gap-1 bg-gold-50 px-3 py-1.5 rounded-lg border border-gold-200">
            <Star className="w-4 h-4 text-gold-600 fill-gold-600" />
            <span className="text-sm font-semibold text-gold-700">{tool.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Key Features */}
      {tool.keyFeatures && tool.keyFeatures.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-navy-700 uppercase tracking-wide mb-3">Key Features</h4>
          <ul className="space-y-2">
            {tool.keyFeatures.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-charcoal">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pricing */}
      <div className="mb-6 pb-6 border-b border-cream-100">
        <h4 className="text-sm font-semibold text-navy-700 uppercase tracking-wide mb-2">Pricing</h4>
        <p className="text-charcoal font-medium">{tool.pricing}</p>
      </div>

      {/* Pros & Cons */}
      <div className="grid sm:grid-cols-2 gap-6 mb-6">
        {/* Pros */}
        <div>
          <h4 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            Pros
          </h4>
          <ul className="space-y-2">
            {tool.pros.map((pro, i) => (
              <li key={i} className="text-sm text-charcoal leading-relaxed">
                {pro}
              </li>
            ))}
          </ul>
        </div>

        {/* Cons */}
        <div>
          <h4 className="text-sm font-semibold text-warm-gray uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <X className="w-4 h-4" />
            Cons
          </h4>
          <ul className="space-y-2">
            {tool.cons.map((con, i) => (
              <li key={i} className="text-sm text-charcoal leading-relaxed">
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Best For */}
      <div className={`${isBrand ? 'bg-gold-50 border-gold-200' : 'bg-cream-50 border-cream-200'} border rounded-xl p-4`}>
        <h4 className="text-sm font-semibold text-navy-700 mb-2">Best For:</h4>
        <p className="text-sm text-charcoal leading-relaxed">{tool.bestFor}</p>
      </div>

      {/* CTA */}
      {isBrand && (
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-block w-full text-center px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
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
            className="inline-block w-full text-center px-6 py-3 bg-cream-100 text-navy-700 font-semibold rounded-xl hover:bg-cream-200 transition-all border border-cream-200"
          >
            Visit {tool.name}
          </a>
        </div>
      )}
    </div>
  );
}
