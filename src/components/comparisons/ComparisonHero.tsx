import { Check, X } from 'lucide-react';
import type { SummaryTableRow } from '@/lib/comparisons';

interface ComparisonHeroProps {
  h1: string;
  description: string;
  summaryTable: SummaryTableRow[];
  competitorName: string;
}

export function ComparisonHero({ h1, description, summaryTable, competitorName }: ComparisonHeroProps) {
  return (
    <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-navy-700 mb-6 leading-tight">
          {h1}
        </h1>
        <p className="text-lg text-warm-gray mb-10 max-w-3xl">
          {description}
        </p>

        {/* Summary Comparison Table */}
        <div className="bg-white rounded-2xl border border-cream-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-navy-700">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-navy-700">Karko AI</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-navy-700">{competitorName}</th>
                </tr>
              </thead>
              <tbody>
                {summaryTable.map((row, i) => (
                  <tr key={i} className="border-b border-cream-100 last:border-b-0">
                    <td className="px-6 py-4 text-sm text-charcoal font-medium">{row.feature}</td>
                    <td className="px-6 py-4 text-center">
                      {typeof row.karkoValue === 'boolean' ? (
                        row.karkoValue ? (
                          <Check className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-warm-gray mx-auto" />
                        )
                      ) : (
                        <span className="text-sm text-charcoal">{row.karkoValue}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {typeof row.competitorValue === 'boolean' ? (
                        row.competitorValue ? (
                          <Check className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-warm-gray mx-auto" />
                        )
                      ) : (
                        <span className="text-sm text-charcoal">{row.competitorValue}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
