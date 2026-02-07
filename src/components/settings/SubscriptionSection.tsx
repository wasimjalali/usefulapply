'use client';

import { useState } from 'react';
import { Check, Crown, Sparkles, Plus, Loader2 } from 'lucide-react';
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
    : 40;
  
  const maxCredits = userCredits?.plan_tier === 'starter' ? 40 : userCredits?.plan_tier === 'plus' ? 160 : 300;
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
        <h3 className="text-sm font-semibold text-charcoal mb-4">Compare Plans</h3>
        
        {/* Mobile: Simple vertical list */}
        <div className="md:hidden space-y-3">
          {/* Starter */}
          <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
            isFreeTier ? 'border-gold-400 bg-gold-50/30' : 'border-cream-200'
          }`}>
            <div>
              <h4 className="font-semibold text-charcoal">Starter</h4>
              <p className="text-lg font-bold text-charcoal">$0<span className="text-xs font-normal text-warm-gray">/mo</span></p>
              <p className="text-xs text-warm-gray">20 apps/month · 40 credits</p>
            </div>
            {isFreeTier && (
              <span className="px-2.5 py-1 text-xs font-semibold bg-navy-50 text-navy-600 rounded-full">Current</span>
            )}
          </div>

          {/* Plus */}
          <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
            subscriptionTier === 'plus' ? 'border-gold-400 bg-gold-50/30' : 'border-cream-200'
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-charcoal">Plus</h4>
                <span className="px-2 py-0.5 bg-gradient-to-r from-gold-400 to-gold-500 text-white text-[10px] font-semibold rounded-full">Popular</span>
              </div>
              <p className="text-lg font-bold text-charcoal">$29.99<span className="text-xs font-normal text-warm-gray">/mo</span></p>
              <p className="text-xs text-warm-gray">60 apps/month · 120 credits</p>
            </div>
            {subscriptionTier === 'plus' ? (
              <span className="px-2.5 py-1 text-xs font-semibold bg-navy-50 text-navy-600 rounded-full">Current</span>
            ) : onUpgrade && (
              <Button variant="gold" size="sm" onClick={() => onUpgrade('plus')}>
                Upgrade
              </Button>
            )}
          </div>

          {/* Pro */}
          <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
            subscriptionTier === 'pro' ? 'border-gold-400 bg-gold-50/30' : 'border-cream-200'
          }`}>
            <div>
              <h4 className="font-semibold text-charcoal">Pro</h4>
              <p className="text-lg font-bold text-charcoal">$49.99<span className="text-xs font-normal text-warm-gray">/mo</span></p>
              <p className="text-xs text-warm-gray">120 apps/month · 240 credits</p>
            </div>
            {subscriptionTier === 'pro' ? (
              <span className="px-2.5 py-1 text-xs font-semibold bg-navy-50 text-navy-600 rounded-full">Current</span>
            ) : onUpgrade && (
              <Button variant="gold" size="sm" onClick={() => onUpgrade('pro')}>
                Upgrade
              </Button>
            )}
          </div>
        </div>

        {/* Desktop: Full 3-column grid with details */}
        <div className="hidden md:grid grid-cols-3 gap-4">
          {/* Starter */}
          <div className={`p-4 rounded-xl border-2 transition-all ${
            isFreeTier ? 'border-gold-400 bg-gold-50/30 shadow-sm' : 'border-cream-200 hover:border-cream-300'
          }`}>
            <h4 className="font-semibold text-charcoal">Starter</h4>
            <p className="text-2xl font-bold text-charcoal mt-2">$0<span className="text-sm font-normal text-warm-gray">/mo</span></p>
            <ul className="mt-4 space-y-2.5 text-sm text-warm-gray">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500 flex-shrink-0" />
                20 applications/month (40 credits)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500 flex-shrink-0" />
                All CV templates
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500 flex-shrink-0" />
                CV + Cover Letter + Email
              </li>
            </ul>
          </div>

          {/* Plus */}
          <div className={`p-4 rounded-xl border-2 transition-all relative ${
            subscriptionTier === 'plus' ? 'border-gold-400 bg-gold-50/30 shadow-sm' : 'border-cream-200 hover:border-cream-300'
          }`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-gold-400 to-gold-500 text-white text-xs font-semibold rounded-full shadow-sm">
              Popular
            </div>
            <h4 className="font-semibold text-charcoal">Plus</h4>
            <p className="text-2xl font-bold text-charcoal mt-2">$29.99<span className="text-sm font-normal text-warm-gray">/mo</span></p>
            <ul className="mt-4 space-y-2.5 text-sm text-warm-gray">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500 flex-shrink-0" />
                60 applications/month (120 credits)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500 flex-shrink-0" />
                Add-on credits available
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500 flex-shrink-0" />
                1 month credit rollover
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500 flex-shrink-0" />
                Priority support
              </li>
            </ul>
          </div>

          {/* Pro */}
          <div className={`p-4 rounded-xl border-2 transition-all ${
            subscriptionTier === 'pro' ? 'border-gold-400 bg-gold-50/30 shadow-sm' : 'border-cream-200 hover:border-cream-300'
          }`}>
            <h4 className="font-semibold text-charcoal">Pro</h4>
            <p className="text-2xl font-bold text-charcoal mt-2">$49.99<span className="text-sm font-normal text-warm-gray">/mo</span></p>
            <ul className="mt-4 space-y-2.5 text-sm text-warm-gray">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-gold-500 flex-shrink-0" />
                120 applications/month (240 credits)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-gold-500 flex-shrink-0" />
                Add-on credits available
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-gold-500 flex-shrink-0" />
                2 months credit rollover
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-gold-500 flex-shrink-0" />
                Premium support
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
