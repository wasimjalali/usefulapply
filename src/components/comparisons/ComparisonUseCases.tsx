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
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gold-50 rounded-full border border-gold-200 mb-4">
            <Target className="w-4 h-4 text-gold-600" />
            <span className="text-sm font-semibold text-gold-700">Choose the Right Tool</span>
          </div>
          <h2 className="font-bold text-navy-600 text-[32px] leading-[1.1] mb-4">Which tool should you choose?</h2>
          <p className="text-warm-gray max-w-2xl mx-auto">
            Different tools excel at different things. Here&apos;s our recommendation based on your specific needs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {useCases.map((useCase, i) => (
            <div key={i} className="bg-white rounded-2xl border border-cream-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-lg font-semibold text-navy-600 mb-3">{useCase.title}</h3>
              <p className="text-sm text-warm-gray mb-4 leading-relaxed">{useCase.description}</p>
              <div className="bg-cream-50 rounded-xl p-4 border border-cream-200">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs font-semibold text-gold-600 uppercase tracking-wide">Recommended:</span>
                  <span className="text-sm font-semibold text-navy-600">{useCase.recommendedTool}</span>
                </div>
                <p className="text-xs text-charcoal leading-relaxed">{useCase.reasoning}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
