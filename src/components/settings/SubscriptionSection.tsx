'use client';

import { useState } from 'react';
import { Check, X, Crown, Sparkles, Loader2, Zap, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

// Single add-on credit pack (must match pricing page)
// TODO: Replace priceId value with actual Stripe Price ID
const addonPacks = [
  { name: 'Credit Pack', credits: 50, applications: 25, price: 19.99, priceId: 'price_addon_credit_pack' },
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
  onUpgrade?: (planTier: 'plus' | 'max') => void;
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
    : 4;
  
  const maxCredits = userCredits?.plan_tier === 'free' ? 4 : userCredits?.plan_tier === 'plus' ? 50 : 200;
  const isFreeTier = subscriptionTier === 'free';

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
                {isFreeTier ? 'Free Plan' : subscriptionTier === 'plus' ? 'Plus Plan' : 'Max Plan'}
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
                  Get 25 applications per month (50 credits), add-on packs, and priority support.
                </p>
                <Button variant="gold" size="sm" className="mt-3" onClick={() => onUpgrade?.('plus')}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  Upgrade Now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add-on Credits — matches pricing page addon band */}
        {!isFreeTier && (
          <div className="mt-5 pt-5 border-t border-cream-200">
            <div className="bg-navy-800 border border-navy-700 rounded-2xl p-5 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                {/* Left: label + headline + note */}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gold-400 uppercase tracking-[0.12em] mb-1.5">
                    Need more this month?
                  </p>
                  <h4 className="font-bold text-white text-[18px] leading-tight mb-1.5">
                    Top up any time with a credit pack.
                  </h4>
                  <p className="text-sm text-navy-300">
                    Credits roll over while your subscription is active.
                  </p>
                </div>

                {/* Right: credit block + buy button */}
                {addonPacks.map((pack) => (
                  <div key={pack.name} className="flex flex-row items-center gap-3">
                    <div className="bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-center">
                      <p className="text-[24px] font-bold text-white leading-none">{pack.credits}</p>
                      <p className="text-[12px] font-semibold text-gold-400 mt-0.5">credits</p>
                      <p className="text-[11px] text-navy-300 mt-0.5">{pack.applications} applications</p>
                    </div>
                    <button
                      onClick={() => handleBuyAddon(pack.name.toLowerCase())}
                      disabled={loadingAddon === pack.name.toLowerCase()}
                      className="px-5 py-3.5 rounded-xl bg-gold-400 hover:bg-gold-500 text-navy-900 font-bold text-[16px] shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-60 flex items-center gap-2 group"
                    >
                      {loadingAddon === pack.name.toLowerCase()
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <>${pack.price}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>
                      }
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

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
                <th className="pb-5 px-2 text-center align-bottom">
                  <div className={`rounded-2xl px-3 py-4 ${
                    isFreeTier ? 'bg-cream-100 ring-2 ring-cream-300' : 'bg-cream-50 ring-1 ring-cream-200'
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <div className="p-1.5 bg-white rounded-lg shadow-sm">
                        <Sparkles className="w-4 h-4 text-warm-gray" />
                      </div>
                      <span className="text-base font-bold text-charcoal">Free</span>
                    </div>
                    <p className="text-2xl font-bold text-charcoal leading-tight">Free</p>
                    <p className="text-xs text-warm-gray mt-1">4 credits/mo</p>
                  </div>
                </th>

                {/* Plus */}
                <th className="pb-5 px-2 text-center align-bottom">
                  <div className="mb-2">
                    <span className="inline-block text-[10px] font-bold bg-gold-500 text-white px-3 py-1 rounded-full tracking-wide">
                      SAVE ~18 HOURS/MONTH
                    </span>
                  </div>
                  <div className={`rounded-2xl px-3 py-4 ${
                    subscriptionTier === 'plus'
                      ? 'bg-gold-50 ring-2 ring-gold-400'
                      : 'bg-gold-50 ring-1 ring-gold-300'
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <div className="p-1.5 bg-white rounded-lg shadow-sm">
                        <Zap className="w-4 h-4 text-gold-500" />
                      </div>
                      <span className="text-base font-bold text-charcoal">Plus</span>
                    </div>
                    <p className="text-2xl font-bold text-charcoal leading-tight">$19.99</p>
                    <p className="text-xs text-warm-gray mt-1">50 credits/mo</p>
                  </div>
                </th>

                {/* Max */}
                <th className="pb-5 px-2 text-center align-bottom">
                  <div className="mb-2">
                    <span className="inline-block text-[10px] font-bold bg-navy-700 text-white px-3 py-1 rounded-full tracking-wide">
                      SAVE ~108 HOURS
                    </span>
                  </div>
                  <div className={`rounded-2xl px-3 py-4 ${
                    subscriptionTier === 'max'
                      ? 'bg-navy-50 ring-2 ring-navy-500'
                      : 'bg-navy-50 ring-1 ring-navy-200'
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <div className="p-1.5 bg-white rounded-lg shadow-sm">
                        <Crown className="w-4 h-4 text-navy-600" />
                      </div>
                      <span className="text-base font-bold text-charcoal">Max</span>
                    </div>
                    <p className="text-2xl font-bold text-charcoal leading-tight">$79.99</p>
                    <p className="text-xs text-warm-gray mt-1">200 credits/mo</p>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {([
                { label: 'Applications/month',            free: '2',      plus: '25',     max: '100' },
                { label: 'Smart Job Feed',                free: false,    plus: '15/day', max: '25/day' },
                { label: 'CV + Cover Letter + Email + Follow-up', free: true, plus: true, max: true },
                { label: 'Match score',                    free: true,     plus: true,     max: true },
                { label: 'ATS-optimized templates',       free: true,     plus: true,     max: true },
                { label: 'Application tracker',           free: true,     plus: true,     max: true },
                { label: 'Unlimited application tracker',  free: false,    plus: true,     max: true },
                { label: 'Add-on credit packs',           free: false,    plus: true,     max: true },
                { label: 'Screening question answers',     free: false,    plus: true,     max: true },
                { label: 'Hours saved/month',             free: '~2h',    plus: '~18h',   max: '~108h' },
              ] as const).map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-cream-50/60' : ''}>
                  <td className="py-2.5 pr-4 text-xs text-warm-gray rounded-l-lg pl-1">{row.label}</td>

                  <td className={`py-2.5 px-3 text-center text-xs ${
                    isFreeTier ? 'bg-cream-100/40' : ''
                  }`}>
                    {typeof row.free === 'boolean'
                      ? row.free
                        ? <Check className="w-4 h-4 text-gold-500 mx-auto" />
                        : <X className="w-3.5 h-3.5 text-cream-300 mx-auto" />
                      : <span className="font-medium text-charcoal">{row.free}</span>
                    }
                  </td>

                  <td className={`py-2.5 px-3 text-center text-xs ${
                    subscriptionTier === 'plus' ? 'bg-gold-50/60' : 'bg-gold-50/30'
                  }`}>
                    {typeof row.plus === 'boolean'
                      ? row.plus
                        ? <Check className="w-4 h-4 text-gold-500 mx-auto" />
                        : <X className="w-3.5 h-3.5 text-cream-300 mx-auto" />
                      : <span className="font-medium text-charcoal">{row.plus}</span>
                    }
                  </td>

                  <td className={`py-2.5 px-3 text-center text-xs rounded-r-lg ${
                    subscriptionTier === 'max' ? 'bg-navy-50/60' : 'bg-navy-50/30'
                  }`}>
                    {typeof row.max === 'boolean'
                      ? row.max
                        ? <Check className="w-4 h-4 text-gold-500 mx-auto" />
                        : <X className="w-3.5 h-3.5 text-cream-300 mx-auto" />
                      : <span className="font-medium text-charcoal">{row.max}</span>
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
                  ) : subscriptionTier === 'max' && onManageBilling ? (
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
                  {subscriptionTier === 'max' ? (
                    <div className="text-center text-xs text-navy-600 font-semibold py-2 rounded-lg border-2 border-navy-200 bg-white">
                      Current
                    </div>
                  ) : onUpgrade ? (
                    <button
                      onClick={() => onUpgrade('max')}
                      className="w-full py-2 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Get Max →
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
