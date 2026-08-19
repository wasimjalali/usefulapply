import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { PLANS } from '@/lib/plans';
import { PlusPlanButton, MaxPlanButton } from '@/components/marketing/HomePricingButtons';

const OUTLINE_BUTTON =
  'flex h-11 w-full items-center justify-center rounded-full border border-cream-200 bg-cream-50 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer';

/** The three plan cards on the landing page. Data comes from `@/lib/plans`. */
export function PlanCards() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isPlus = plan.tier === 'plus';
          return (
            <div
              key={plan.tier}
              className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
                isPlus ? 'border-gold-200 bg-gold-50' : 'border-cream-200 bg-cream-50'
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold text-navy-800">{plan.name}</span>
                {isPlus && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-600">
                    Most popular
                  </span>
                )}
              </div>

              <p className="mt-3 font-serif text-[32px] font-semibold leading-none text-navy-900">
                {plan.price}
                <span className="ml-1.5 font-sans text-sm font-normal text-warm-gray">{plan.per}</span>
              </p>

              <p className="mt-4 text-sm font-semibold text-navy-800">{plan.credits}</p>

              <ul className="mt-3 mb-6 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-charcoal">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-500" />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.tier === 'free' && (
                <Link href="/dashboard" className={OUTLINE_BUTTON}>
                  Try it free
                </Link>
              )}
              {plan.tier === 'plus' && <PlusPlanButton />}
              {plan.tier === 'max' && <MaxPlanButton />}
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 transition-colors duration-200 hover:text-gold-600 cursor-pointer"
        >
          Compare all plans and features
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export { OUTLINE_BUTTON };
