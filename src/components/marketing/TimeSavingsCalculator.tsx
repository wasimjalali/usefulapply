'use client';

import { useState, useEffect, useRef } from 'react';

const savingsTiers = [
  {
    plan: 'Free',
    apps: 2,
    hoursSaved: 2,
    price: 'Free',
    tagline: 'That is 2 hours you get back for free. No credit card required.',
  },
  {
    plan: 'Plus',
    apps: 25,
    hoursSaved: 18,
    price: '$19.99/mo',
    tagline: 'That is over 18 hours saved every month. At ~$0.80 per application.',
  },
  {
    plan: 'Max',
    apps: 100,
    hoursSaved: 108,
    price: '$79.99/mo',
    tagline: 'That is over two and a half work weeks saved. Full automation at ~$0.80 per application.',
  },
];

function useAnimatedCount(target: number, duration: number = 800, active: boolean = true) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (!active) { setCount(0); return; }
    const start = prevTarget.current !== target ? 0 : count;
    prevTarget.current = target;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, active, duration]);

  return count;
}

export function TimeSavingsCalculator() {
  const [selectedTier, setSelectedTier] = useState(1); // default Plus
  const currentSavings = savingsTiers[selectedTier];
  const animatedApps = useAnimatedCount(currentSavings.apps);
  const animatedHours = useAnimatedCount(currentSavings.hoursSaved);

  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-lg p-8 md:p-10">
      {/* Tier Selector — pill buttons */}
      <div className="flex items-center justify-center mb-10">
        <div className="inline-flex bg-cream-100 rounded-xl p-1.5 gap-1 border border-cream-200">
          {savingsTiers.map((tier, i) => (
            <button
              key={tier.plan}
              onClick={() => setSelectedTier(i)}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                i === selectedTier
                  ? 'bg-white text-navy-600 shadow-md border border-cream-200'
                  : 'text-warm-gray hover:text-navy-600 hover:bg-cream-50'
              }`}
            >
              <span>{tier.plan}</span>
              <span className="block text-xs font-normal mt-0.5 opacity-70">{tier.price}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 md:gap-6 mb-8">
        <div className="text-center p-4 md:p-6 bg-cream-50 rounded-xl border border-cream-200">
          <div className="text-3xl md:text-5xl font-bold text-navy-600 mb-2">{animatedApps}</div>
          <div className="text-sm text-warm-gray">applications/month</div>
        </div>
        <div className="text-center p-4 md:p-6 bg-cream-50 rounded-xl border border-cream-200">
          <div className="text-3xl md:text-5xl font-bold text-gold-500 mb-2">&lt;90</div>
          <div className="text-sm text-warm-gray">seconds each</div>
        </div>
        <div className="text-center p-4 md:p-6 bg-navy-600 rounded-xl">
          <div className="text-3xl md:text-5xl font-bold text-gold-400 mb-2">~{animatedHours}</div>
          <div className="text-sm text-gold-300 font-medium">hours saved/month</div>
        </div>
      </div>

      {/* Tagline */}
      <p className="text-center text-lg font-medium text-navy-600 mb-2">
        {currentSavings.tagline}
      </p>

      {/* Disclaimer */}
      <p className="text-center text-sm text-warm-gray">
        Based on 45-60 min of manual work per tailored application.
      </p>
    </div>
  );
}
