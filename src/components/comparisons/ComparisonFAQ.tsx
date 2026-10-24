import type { FAQ } from '@/lib/comparisons';

interface ComparisonFAQProps {
  faq: FAQ[];
}

export function ComparisonFAQ({ faq }: ComparisonFAQProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-bold text-brand text-[32px] leading-[1.1] mb-10 text-center">Frequently asked questions.</h2>
        <div className="space-y-6">
          {faq.map((item, i) => (
            <div key={i} className="bg-surface-raised rounded-card border border-border p-6 shadow-resting">
              <h3 className="text-lg font-semibold text-brand mb-3">{item.question}</h3>
              <p className="text-ink-body leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
