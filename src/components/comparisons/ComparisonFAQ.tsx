import type { FAQ } from '@/lib/comparisons';

interface ComparisonFAQProps {
  faq: FAQ[];
}

export function ComparisonFAQ({ faq }: ComparisonFAQProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-navy-700 mb-10 text-center">Frequently Asked Questions</h2>
        <div className="space-y-6">
          {faq.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-cream-200 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-navy-700 mb-3">{item.question}</h3>
              <p className="text-charcoal leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
