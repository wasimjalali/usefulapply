'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Zap, Crown, Check, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  required?: number;
  available?: number;
}

const PLANS = [
  {
    tier: 'plus' as const,
    name: 'Plus',
    tagline: 'For serious job seekers',
    badge: 'SAVE ~37 HOURS/MONTH',
    badgeStyle: 'bg-gold-500 text-white',
    price: '$39.99',
    priceNote: '~$0.80 per application',
    credits: '100 credits/month',
    creditsStyle: 'bg-gold-100 text-gold-700 border border-gold-300',
    features: [
      '50 complete applications/month',
      'Everything in Free, plus:',
      'Unlimited application history',
      'Add-on credit packs (rollover)',
      'Priority email support',
      'Powered by Claude Sonnet 4.6',
    ],
    hoursSaved: 'Cancel anytime. No contracts.',
    hoursBg: 'bg-gold-500 text-white',
    cta: 'Get Plus →',
    ctaStyle: 'bg-gold-500 hover:bg-gold-600 text-white',
    cardStyle: 'border-2 border-gold-400 shadow-lg shadow-gold-100 scale-[1.02]',
    headerStyle: 'bg-gold-500',
  },
  {
    tier: 'max' as const,
    name: 'Max',
    tagline: 'Full automation for power applicants',
    badge: 'SAVE ~108 HOURS/MONTH',
    badgeStyle: 'bg-navy-700 text-white',
    price: '$79.99',
    priceNote: '~$0.80 per application',
    credits: '200 credits/month',
    creditsStyle: 'bg-navy-100 text-navy-700 border border-navy-200',
    features: [
      '100 complete applications/month',
      'Everything in Plus, plus:',
      'Chrome Extension: auto-fill ATS forms (Coming Soon)',
      'Chrome Extension: AI screening answers (Coming Soon)',
      'Premium dedicated support',
      'Powered by Claude Sonnet 4.6',
    ],
    hoursSaved: 'Cancel anytime. No contracts.',
    hoursBg: 'bg-navy-700 text-white',
    cta: 'Get Max →',
    ctaStyle: 'bg-navy-700 hover:bg-navy-800 text-white',
    cardStyle: 'border-2 border-navy-200',
    headerStyle: 'bg-navy-700',
  },
] as const;

export function InsufficientCreditsModal({
  isOpen,
  onClose,
  required,
  available,
}: InsufficientCreditsModalProps) {
  const { user } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<'plus' | 'max' | null>(null);

  // Escape key handler for accessibility
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const handleUpgrade = async (planTier: 'plus' | 'max') => {
    if (!user) return;
    setLoadingPlan(planTier);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, planTier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start checkout. Please try again.');
        setLoadingPlan(null);
      }
    } catch {
      alert('Something went wrong. Please try again.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Insufficient credits">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-cream-50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 p-2 rounded-xl text-warm-gray hover:bg-cream-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-8 pb-6 text-center border-b border-cream-200">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gold-100 rounded-2xl mb-4">
            <Zap className="w-7 h-7 text-gold-500" />
          </div>
          <h2 className="text-2xl font-bold text-charcoal">
            You&apos;re out of credits
          </h2>
          {required !== undefined && available !== undefined && (
            <p className="mt-2 text-warm-gray text-sm">
              This action requires <strong>{required} credits</strong>, but you only have{' '}
              <strong>{available} credit{available !== 1 ? 's' : ''}</strong> remaining.
            </p>
          )}
          <p className="mt-2 text-warm-gray text-sm">
            Upgrade to keep applying — your CV, cover letter, email, and follow-up,
            all tailored for every role.
          </p>
        </div>

        {/* Plan cards */}
        <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`bg-white rounded-2xl overflow-hidden transition-all ${plan.cardStyle}`}
            >
              {/* Badge bar */}
              <div className={`px-4 py-2 text-center text-xs font-bold tracking-wide ${plan.headerStyle} text-white`}>
                {plan.badge}
              </div>

              <div className="p-5">
                {/* Plan name + tagline */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-xl ${plan.tier === 'plus' ? 'bg-gold-100' : 'bg-navy-50'}`}>
                    {plan.tier === 'plus'
                      ? <Zap className="w-5 h-5 text-gold-500" />
                      : <Crown className="w-5 h-5 text-navy-600" />
                    }
                  </div>
                  <div>
                    <p className="font-bold text-charcoal">{plan.name}</p>
                    <p className="text-xs text-warm-gray">{plan.tagline}</p>
                  </div>
                </div>

                {/* Price */}
                <p className="text-3xl font-bold text-charcoal mb-0.5">
                  {plan.price}
                  <span className="text-sm font-normal text-warm-gray"> /month</span>
                </p>
                <p className="text-xs text-warm-gray mb-3">{plan.priceNote}</p>

                {/* Credits pill */}
                <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full mb-4 ${plan.creditsStyle}`}>
                  {plan.credits}
                </span>

                {/* Features */}
                <ul className="space-y-2 mb-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-charcoal">
                      <Check className="w-4 h-4 text-gold-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* Hours saved */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium mb-4 ${plan.hoursBg}`}>
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  {plan.hoursSaved}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={loadingPlan !== null}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 ${plan.ctaStyle}`}
                >
                  {loadingPlan === plan.tier ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    plan.cta
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 text-center">
          <p className="text-xs text-warm-gray">
            Not ready to upgrade?{' '}
            <a href="/pricing" className="text-navy-600 hover:underline font-medium">
              View all plans
            </a>{' '}
            or{' '}
            <button onClick={onClose} className="text-navy-600 hover:underline font-medium cursor-pointer">
              continue with current plan
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
