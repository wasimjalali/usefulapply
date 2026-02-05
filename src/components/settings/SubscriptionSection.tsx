'use client';

import { Check, Crown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

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
}

export function SubscriptionSection({
  subscriptionTier,
  userCredits,
  onManageBilling,
  onUpgrade,
}: SubscriptionSectionProps) {
  const totalCredits = userCredits 
    ? userCredits.monthly_credits + userCredits.rollover_credits + userCredits.addon_credits 
    : 10;
  
  const maxCredits = userCredits?.plan_tier === 'starter' ? 10 : userCredits?.plan_tier === 'plus' ? 160 : 300;
  const isFreeTier = subscriptionTier === 'starter' || subscriptionTier === 'free';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-charcoal">Subscription</h2>
        <p className="text-sm text-warm-gray mt-1">
          Manage your subscription and billing
        </p>
      </div>

      {/* Current Plan */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-charcoal">
                {isFreeTier ? 'Starter Plan' : subscriptionTier === 'plus' ? 'Plus Plan' : 'Pro Plan'}
              </h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-cream-200 text-warm-gray rounded-full">
                Current
              </span>
            </div>
            <p className="text-sm text-warm-gray mt-1">
              {totalCredits} credits remaining
            </p>
            <div className="mt-2 w-full bg-cream-200 rounded-full h-2">
              <div 
                className="bg-navy-500 h-2 rounded-full transition-all"
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

      {/* Plan Comparison */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-charcoal mb-4">Compare Plans</h3>
        <div className="grid grid-cols-3 gap-4">
          {/* Starter */}
          <div className={`p-4 rounded-xl border-2 ${isFreeTier ? 'border-navy-500 bg-navy-50' : 'border-cream-200'}`}>
            <h4 className="font-semibold text-charcoal">Starter</h4>
            <p className="text-2xl font-bold text-charcoal mt-2">$0<span className="text-sm font-normal text-warm-gray">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm text-warm-gray">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                3 applications/month (6 credits)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                All CV templates
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                CV + Cover Letter + Email
              </li>
            </ul>
          </div>

          {/* Plus */}
          <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'plus' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'} relative`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gold-500 text-white text-xs font-medium rounded-full">
              Popular
            </div>
            <h4 className="font-semibold text-charcoal">Plus</h4>
            <p className="text-2xl font-bold text-charcoal mt-2">$19.99<span className="text-sm font-normal text-warm-gray">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm text-warm-gray">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                60 applications/month (120 credits)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                Add-on credits available
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                1 month credit rollover
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                Priority support
              </li>
            </ul>
          </div>

          {/* Pro */}
          <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'pro' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'}`}>
            <h4 className="font-semibold text-charcoal">Pro</h4>
            <p className="text-2xl font-bold text-charcoal mt-2">$39.99<span className="text-sm font-normal text-warm-gray">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm text-warm-gray">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                120 applications/month (240 credits)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                Add-on credits available
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                2 months credit rollover
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sage-500" />
                Premium support
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
