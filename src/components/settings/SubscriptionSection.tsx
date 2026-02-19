'use client';

import { useState } from 'react';
import { Check, X, Crown, Sparkles, Plus, Loader2, Zap, Clock } from 'lucide-react';
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
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-charcoal">Compare Plans</h3>
          <a href="/pricing" className="text-xs text-navy-600 hover:underline font-medium">View full pricing →</a>
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr>
                {/* Feature label column */}
                <th className="text-left pb-4 pr-4 w-[38%]" />

                {/* Starter */}
                <th className="pb-4 px-3 text-center">
                  <div className={`rounded-xl px-2 py-2.5 ${
                    isFreeTier ? 'bg-cream-100 ring-2 ring-cream-300' : 'bg-cream-50'
                  }`}>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-warm-gray" />
                      <span className="text-sm font-bold text-charcoal">Starter</span>
                    </div>
                    <p className="text-base font-bold text-charcoal">Free</p>
                    <p className="text-[11px] text-warm-gray">10 credits/mo</p>
                  </div>
                </th>

                {/* Plus */}
                <th className="pb-4 px-3 text-center">
                  <div className={`rounded-xl px-2 py-2.5 relative ${
                    subscriptionTier === 'plus'
                      ? 'bg-gold-50 ring-2 ring-gold-400'
                      : 'bg-gold-50 ring-1 ring-gold-200'
                  }`}>
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-gold-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap tracking-wide">
                      POPULAR
                    </span>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Zap className="w-3.5 h-3.5 text-gold-500" />
                      <span className="text-sm font-bold text-charcoal">Plus</span>
                    </div>
                    <p className="text-base font-bold text-charcoal">$29.99</p>
                    <p className="text-[11px] text-warm-gray">120 credits/mo</p>
                  </div>
                </th>

                {/* Pro */}
                <th className="pb-4 px-3 text-center">
                  <div className={`rounded-xl px-2 py-2.5 ${
                    subscriptionTier === 'pro'
                      ? 'bg-navy-50 ring-2 ring-navy-500'
                      : 'bg-navy-50 ring-1 ring-navy-100'
                  }`}>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Crown className="w-3.5 h-3.5 text-navy-600" />
                      <span className="text-sm font-bold text-charcoal">Pro</span>
                    </div>
                    <p className="text-base font-bold text-charcoal">$49.99</p>
                    <p className="text-[11px] text-warm-gray">240 credits/mo</p>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {([
                { label: 'Applications/month',            starter: '5',      plus: '60',     pro: '120' },
                { label: 'Price per application',         starter: '—',      plus: '~$0.50', pro: '~$0.42' },
                { label: 'CV + Cover Letter + Email + Follow-up', starter: true, plus: true, pro: true },
                { label: 'Fit score before you apply',    starter: true,     plus: true,     pro: true },
                { label: 'US & EU templates',             starter: true,     plus: true,     pro: true },
                { label: 'Unlimited application history', starter: false,    plus: true,     pro: true },
                { label: 'Add-on credit packs',           starter: false,    plus: true,     pro: true },
                { label: 'Credit rollover',               starter: false,    plus: false,    pro: '2 months' },
                { label: 'Hours saved/month',             starter: '~4h',    plus: '~45h',   pro: '~90h' },
              ] as const).map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-cream-50/60' : ''}>
                  <td className="py-2.5 pr-4 text-xs text-warm-gray rounded-l-lg pl-1">{row.label}</td>

                  <td className={`py-2.5 px-3 text-center text-xs ${
                    isFreeTier ? 'bg-cream-100/40' : ''
                  }`}>
                    {typeof row.starter === 'boolean'
                      ? row.starter
                        ? <Check className="w-4 h-4 text-sage-500 mx-auto" />
                        : <X className="w-3.5 h-3.5 text-cream-300 mx-auto" />
                      : <span className="font-medium text-charcoal">{row.starter}</span>
                    }
                  </td>

                  <td className={`py-2.5 px-3 text-center text-xs ${
                    subscriptionTier === 'plus' ? 'bg-gold-50/60' : 'bg-gold-50/30'
                  }`}>
                    {typeof row.plus === 'boolean'
                      ? row.plus
                        ? <Check className="w-4 h-4 text-sage-500 mx-auto" />
                        : <X className="w-3.5 h-3.5 text-cream-300 mx-auto" />
                      : <span className="font-medium text-charcoal">{row.plus}</span>
                    }
                  </td>

                  <td className={`py-2.5 px-3 text-center text-xs rounded-r-lg ${
                    subscriptionTier === 'pro' ? 'bg-navy-50/60' : 'bg-navy-50/30'
                  }`}>
                    {typeof row.pro === 'boolean'
                      ? row.pro
                        ? <Check className="w-4 h-4 text-sage-500 mx-auto" />
                        : <X className="w-3.5 h-3.5 text-cream-300 mx-auto" />
                      : <span className="font-medium text-charcoal">{row.pro}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>

            {/* CTA row */}
            <tfoot>
              <tr>
                <td />
                <td className="pt-4 px-3">
                  {isFreeTier ? (
                    <div className="text-center text-xs text-navy-600 font-semibold py-2 rounded-lg border-2 border-navy-200 bg-white">
                      Current
                    </div>
                  ) : null}
                </td>
                <td className="pt-4 px-3">
                  {subscriptionTier === 'plus' ? (
                    <div className="text-center text-xs text-navy-600 font-semibold py-2 rounded-lg border-2 border-navy-200 bg-white">
                      Current
                    </div>
                  ) : subscriptionTier === 'pro' && onManageBilling ? (
                    <Button variant="outline" size="sm" className="w-full text-xs py-2" onClick={onManageBilling}>
                      Downgrade
                    </Button>
                  ) : onUpgrade ? (
                    <button
                      onClick={() => onUpgrade('plus')}
                      className="w-full py-2 rounded-lg bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Get Plus →
                    </button>
                  ) : null}
                </td>
                <td className="pt-4 px-3">
                  {subscriptionTier === 'pro' ? (
                    <div className="text-center text-xs text-navy-600 font-semibold py-2 rounded-lg border-2 border-navy-200 bg-white">
                      Current
                    </div>
                  ) : onUpgrade ? (
                    <button
                      onClick={() => onUpgrade('pro')}
                      className="w-full py-2 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Get Pro →
                    </button>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
