'use client';

import { useState } from 'react';
import { Check, Crown, Sparkles, Plus, Loader2, Zap, Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

// Add-on credit packs (must match pricing page)
// TODO: Replace priceId values with actual Stripe Price IDs
const addonPacks = [
  { name: 'Medium', credits: 60, applications: 40, price: 14.99, priceId: 'price_addon_medium' },
  { name: 'Large', credits: 120, applications: 80, price: 29.99, priceId: 'price_addon_large' },
];

export interface UserCredits {
  plan_tier: string;
  monthly_credits: number;
  rollover_credits: number;
  addon_credits: number;
}

interface SubscriptionSectionProps {
  subscriptionTier: string;
  userCredits: UserCredits | null;
  userId?: string;
  onManageBilling?: () => void;
  onUpgrade?: (planTier: 'plus' | 'pro') => void;
  onBuyAddon?: (packSize: string) => Promise<void>;
}

export function SubscriptionSection({
  subscriptionTier,
  userCredits,
  onManageBilling,
  onUpgrade,
  onBuyAddon,
}: SubscriptionSectionProps) {
  const [loadingAddon, setLoadingAddon] = useState<string | null>(null);

  const handleBuyAddon = async (packName: string) => {
    if (!onBuyAddon) return;
    setLoadingAddon(packName);
    try {
      await onBuyAddon(packName);
    } finally {
      setLoadingAddon(null);
    }
  };
  const totalCredits = userCredits 
    ? userCredits.monthly_credits + userCredits.rollover_credits + userCredits.addon_credits 
    : 10;
  
  const maxCredits = userCredits?.plan_tier === 'starter' ? 10 : userCredits?.plan_tier === 'plus' ? 120 : 240;
  const isFreeTier = subscriptionTier === 'starter' || subscriptionTier === 'free';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-charcoal">Subscription</h2>
        <p className="text-sm text-warm-gray mt-1">
          Manage your subscription and billing
        </p>
      </div>

      {/* Current Plan */}
      <Card className="p-6 rounded-2xl border-cream-200 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-charcoal">
                {isFreeTier ? 'Starter Plan' : subscriptionTier === 'plus' ? 'Plus Plan' : 'Pro Plan'}
              </h3>
              <span className="px-2 py-0.5 text-xs font-semibold bg-navy-50 text-navy-600 rounded-full border border-navy-100">
                Current
              </span>
            </div>
            <p className="text-sm text-warm-gray mt-1">
              {totalCredits} credits remaining
            </p>
            <div className="mt-2 w-full bg-cream-200 rounded-full h-2.5">
              <div 
                className="bg-gradient-to-r from-gold-400 to-gold-500 h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min((totalCredits / maxCredits) * 100, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-warm-gray">
              <span>Monthly: {userCredits?.monthly_credits || 0}</span>
              {(userCredits?.rollover_credits || 0) > 0 && <span>Rollover: {userCredits?.rollover_credits}</span>}
              {(userCredits?.addon_credits || 0) > 0 && <span>Add-on: {userCredits?.addon_credits}</span>}
            </div>
          </div>
          {!isFreeTier && onManageBilling && (
            <Button variant="outline" size="sm" onClick={onManageBilling}>
              Manage Billing
            </Button>
          )}
        </div>

        {isFreeTier && onUpgrade && (
          <div className="mt-4 p-4 bg-gradient-to-r from-gold-50 to-gold-100 rounded-xl border border-gold-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gold-500 rounded-lg">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-charcoal">Upgrade to Plus</h4>
                <p className="text-sm text-warm-gray mt-1">
                  Get 60 applications per month (120 credits), add-on packs, and priority support.
                </p>
                <Button variant="gold" size="sm" className="mt-3" onClick={() => onUpgrade?.('plus')}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  Upgrade Now
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Add-on Credits */}
      {!isFreeTier && (
        <Card className="p-6 rounded-2xl border-cream-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-charcoal">Need More Credits?</h3>
              <p className="text-xs text-warm-gray mt-1">Purchase add-on credit packs. Credits never expire.</p>
            </div>
            <Link
              href="/pricing#addons"
              className="text-xs font-medium text-navy-600 hover:text-navy-700 transition-colors"
            >
              View all packs →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {addonPacks.map((pack) => (
              <div key={pack.name} className="border border-cream-200 rounded-xl p-4 text-center hover:border-gold-300 hover:shadow-sm transition-all">
                <div className="text-xl font-bold text-charcoal">{pack.credits}</div>
                <div className="text-xs text-warm-gray mb-1">credits ({pack.applications} apps)</div>
                <div className="text-sm font-bold text-navy-600 mb-3">${pack.price}</div>
                <button
                  onClick={() => handleBuyAddon(pack.name.toLowerCase())}
                  disabled={loadingAddon === pack.name.toLowerCase()}
                  className="w-full px-3 py-1.5 bg-navy-600 text-white text-xs font-semibold rounded-lg hover:bg-navy-700 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {loadingAddon === pack.name.toLowerCase() ? (
                    <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                  ) : (
                    <><Plus className="w-3 h-3 inline mr-1" />Buy</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isFreeTier && (
        <Card className="p-6 rounded-2xl border-cream-200 shadow-sm">
          <div className="flex items-center gap-3 p-4 bg-cream-50 rounded-xl">
            <Plus className="w-5 h-5 text-warm-gray" />
            <div>
              <p className="text-sm font-medium text-charcoal">Add-on credit packs</p>
              <p className="text-xs text-warm-gray mt-0.5">
                Upgrade to Plus or Pro to purchase add-on credit packs.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Plan Comparison */}
      <Card className="p-6 rounded-2xl border-cream-200 shadow-sm">
        <h3 className="text-sm font-semibold text-charcoal mb-5">Compare Plans</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">

          {/* Starter */}
          <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
            isFreeTier ? 'border-gold-300 shadow-sm' : 'border-cream-200'
          }`}>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-cream-100 rounded-xl">
                  <Sparkles className="w-5 h-5 text-warm-gray" />
                </div>
                <div>
                  <p className="font-bold text-charcoal">Starter</p>
                  <p className="text-xs text-warm-gray">See your first AI application</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-charcoal mb-0.5">
                Free <span className="text-sm font-normal text-warm-gray">forever</span>
              </p>
              <p className="text-xs text-warm-gray mb-3">10 credits/month</p>
              <ul className="space-y-2 mb-4">
                {[
                  '5 complete applications/month',
                  'Tailored CV, cover letter, email & follow-up',
                  'Fit score before you apply',
                  'US & EU professional templates',
                  'No watermark on any document',
                  'Claude Sonnet 4.6, specialized for job applications',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-charcoal">
                    <Check className="w-4 h-4 text-sage-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-cream-100 text-charcoal mb-4">
                <Clock className="w-4 h-4 flex-shrink-0 text-warm-gray" />
                ~4 hours saved/month
              </div>
              {isFreeTier ? (
                <div className="w-full py-2.5 rounded-xl border-2 border-navy-600 text-navy-600 text-sm font-semibold text-center">
                  Current Plan
                </div>
              ) : (
                <div className="w-full py-2.5 rounded-xl border-2 border-cream-300 text-warm-gray text-sm font-semibold text-center">
                  Free Plan
                </div>
              )}
            </div>
          </div>

          {/* Plus */}
          <div className={`rounded-2xl border-2 overflow-hidden transition-all relative ${
            subscriptionTier === 'plus'
              ? 'border-gold-400 shadow-md'
              : 'border-gold-300 shadow-md shadow-gold-100'
          }`}>
            <div className="bg-gold-500 px-4 py-2 text-center text-xs font-bold tracking-wide text-white">
              MOST POPULAR
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-gold-100 rounded-xl">
                  <Zap className="w-5 h-5 text-gold-500" />
                </div>
                <div>
                  <p className="font-bold text-charcoal">Plus</p>
                  <p className="text-xs text-warm-gray">For serious job seekers</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-charcoal mb-0.5">
                $29.99 <span className="text-sm font-normal text-warm-gray">/month</span>
              </p>
              <p className="text-xs text-warm-gray mb-2">~$0.50 per application</p>
              <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-gold-100 text-gold-700 border border-gold-300 mb-4">
                120 credits/month
              </span>
              <ul className="space-y-2 mb-4">
                {[
                  '60 complete applications/month',
                  'Tailored CV, cover letter, email & follow-up',
                  'Fit score before you apply',
                  'Unlimited application history',
                  'Add-on credit packs available',
                  'Claude Sonnet 4.6, specialized for job applications',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-charcoal">
                    <Check className="w-4 h-4 text-sage-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-gold-500 text-white mb-4">
                <Clock className="w-4 h-4 flex-shrink-0" />
                ~45 hours saved/month
              </div>
              {subscriptionTier === 'plus' ? (
                <div className="w-full py-2.5 rounded-xl border-2 border-navy-600 text-navy-600 text-sm font-semibold text-center">
                  Current Plan
                </div>
              ) : subscriptionTier === 'pro' && onManageBilling ? (
                <Button variant="outline" size="sm" className="w-full" onClick={onManageBilling}>
                  Downgrade to Plus
                </Button>
              ) : onUpgrade && (
                <button
                  onClick={() => onUpgrade('plus')}
                  className="w-full py-2.5 rounded-xl bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Get Plus →
                </button>
              )}
            </div>
          </div>

          {/* Pro */}
          <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
            subscriptionTier === 'pro' ? 'border-navy-600 shadow-md' : 'border-navy-200'
          }`}>
            <div className="bg-navy-700 px-4 py-2 text-center text-xs font-bold tracking-wide text-white">
              BEST VALUE PER APPLICATION
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-navy-50 rounded-xl">
                  <Crown className="w-5 h-5 text-navy-600" />
                </div>
                <div>
                  <p className="font-bold text-charcoal">Pro</p>
                  <p className="text-xs text-warm-gray">For high-volume applicants</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-charcoal mb-0.5">
                $49.99 <span className="text-sm font-normal text-warm-gray">/month</span>
              </p>
              <p className="text-xs text-warm-gray mb-2">~$0.42 per application</p>
              <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-navy-100 text-navy-700 border border-navy-200 mb-4">
                240 credits/month
              </span>
              <ul className="space-y-2 mb-4">
                {[
                  '120 complete applications/month',
                  'Tailored CV, cover letter, email & follow-up',
                  'Fit score before you apply',
                  'Unlimited history + credit rollover (2 months)',
                  'Add-on credit packs available',
                  'Claude Sonnet 4.6, specialized for job applications',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-charcoal">
                    <Check className="w-4 h-4 text-sage-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-navy-700 text-white mb-4">
                <Clock className="w-4 h-4 flex-shrink-0" />
                ~90 hours saved/month
              </div>
              {subscriptionTier === 'pro' ? (
                <div className="w-full py-2.5 rounded-xl border-2 border-navy-600 text-navy-600 text-sm font-semibold text-center">
                  Current Plan
                </div>
              ) : onUpgrade && (
                <button
                  onClick={() => onUpgrade('pro')}
                  className="w-full py-2.5 rounded-xl bg-navy-700 hover:bg-navy-800 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Get Pro →
                </button>
              )}
            </div>
          </div>

        </div>
      </Card>
    </div>
  );
}
