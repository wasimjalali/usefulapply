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
        <h1 className="font-bold text-brand text-[44px] sm:text-[52px] lg:text-[56px] leading-[1.05] tracking-tight mb-6">
          {h1}
        </h1>
        <p className="text-lg text-ink-muted mb-10 max-w-3xl">
          {description}
        </p>

        {/* Summary Comparison Table */}
        <div className="bg-surface-raised rounded-card border border-border overflow-hidden shadow-resting">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-brand-strong">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-brand-strong">Useful Apply</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-brand-strong">{competitorName}</th>
                </tr>
              </thead>
              <tbody>
                {summaryTable.map((row, i) => (
                  <tr key={i} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-6 py-4 text-sm text-ink-body font-medium">{row.feature}</td>
                    <td className="px-6 py-4 text-center">
                      {typeof row.brandValue === 'boolean' ? (
                        row.brandValue ? (
                          <Check className="w-5 h-5 text-positive mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-ink-muted mx-auto" />
                        )
                      ) : (
                        <span className="text-sm text-ink-body">{row.brandValue}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {typeof row.competitorValue === 'boolean' ? (
                        row.competitorValue ? (
                          <Check className="w-5 h-5 text-positive mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-ink-muted mx-auto" />
                        )
                      ) : (
                        <span className="text-sm text-ink-body">{row.competitorValue}</span>
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
