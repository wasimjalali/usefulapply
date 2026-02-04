'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Coins, TrendingUp, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCredits, getTotalCredits, UserCredits } from '@/lib/supabase/credits';

interface CreditBalanceProps {
  variant?: 'compact' | 'full';
  showUpgrade?: boolean;
}

export default function CreditBalance({ variant = 'compact', showUpgrade = true }: CreditBalanceProps) {
  const { user } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCredits() {
      if (!user) {
        setLoading(false);
        return;
      }

      const { credits: userCredits, error } = await getUserCredits(user.id);
      if (!error && userCredits) {
        setCredits(userCredits);
      }
      setLoading(false);
    }

    fetchCredits();
  }, [user]);

  if (loading) {
    return (
      <div className="animate-pulse flex items-center gap-2">
        <div className="w-5 h-5 bg-cream-200 rounded-full" />
        <div className="w-12 h-4 bg-cream-200 rounded" />
      </div>
    );
  }

  if (!credits) {
    return null;
  }

  const totalCredits = getTotalCredits(credits);
  const isLow = totalCredits < 20;
  const planLabel = credits.plan_tier.charAt(0).toUpperCase() + credits.plan_tier.slice(1);

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
            isLow ? 'bg-red-50 text-red-600' : 'bg-gold-50 text-gold-600'
          }`}
        >
          {isLow ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <Coins className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{totalCredits}</span>
        </div>
        {showUpgrade && credits.plan_tier === 'starter' && (
          <Link
            href="/pricing"
            className="text-xs font-medium text-gold-500 hover:text-gold-600 transition-colors"
          >
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  // Full variant for settings page
  return (
    <div className="bg-white rounded-xl border border-cream-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-charcoal">Credit Balance</h3>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            credits.plan_tier === 'pro'
              ? 'bg-sage-100 text-sage-600'
              : credits.plan_tier === 'plus'
                ? 'bg-gold-100 text-gold-600'
                : 'bg-cream-100 text-warm-gray'
          }`}
        >
          {planLabel} Plan
        </span>
      </div>

      {/* Total Credits */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className={`p-3 rounded-xl ${
            isLow ? 'bg-red-50' : 'bg-gold-50'
          }`}
        >
          {isLow ? (
            <AlertCircle className="w-6 h-6 text-red-500" />
          ) : (
            <Coins className="w-6 h-6 text-gold-500" />
          )}
        </div>
        <div>
          <div className="text-3xl font-bold text-charcoal">{totalCredits}</div>
          <div className="text-sm text-warm-gray">credits available</div>
        </div>
      </div>

      {/* Credit Breakdown */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-warm-gray">Monthly Credits</span>
          <span className="font-medium text-charcoal">{credits.monthly_credits}</span>
        </div>
        {credits.rollover_credits > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">Rollover Credits</span>
            <span className="font-medium text-charcoal">{credits.rollover_credits}</span>
          </div>
        )}
        {credits.addon_credits > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">Add-on Credits</span>
            <span className="font-medium text-charcoal">{credits.addon_credits}</span>
          </div>
        )}
      </div>

      {/* Usage Info */}
      <div className="bg-cream-50 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-warm-gray mb-2">
          <TrendingUp className="w-4 h-4" />
          <span>Credit Usage</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-charcoal">10</div>
            <div className="text-xs text-warm-gray">Full App</div>
          </div>
          <div>
            <div className="text-lg font-bold text-charcoal">2</div>
            <div className="text-xs text-warm-gray">Cover Regen</div>
          </div>
          <div>
            <div className="text-lg font-bold text-charcoal">1</div>
            <div className="text-xs text-warm-gray">Email Regen</div>
          </div>
        </div>
      </div>

      {/* Low Credit Warning */}
      {isLow && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">Low credits</p>
              <p className="text-xs text-red-600 mt-1">
                You have less than 20 credits remaining. Consider upgrading or purchasing add-on credits.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {credits.plan_tier !== 'pro' && (
          <Link
            href="/pricing"
            className="flex-1 px-4 py-2 bg-gold-400 text-white text-sm font-medium rounded-lg hover:bg-gold-500 transition-colors text-center"
          >
            Upgrade Plan
          </Link>
        )}
        {(credits.plan_tier === 'plus' || credits.plan_tier === 'pro') && (
          <Link
            href="/pricing#addons"
            className="flex-1 px-4 py-2 border border-navy-600 text-navy-600 text-sm font-medium rounded-lg hover:bg-navy-50 transition-colors text-center"
          >
            Buy Credits
          </Link>
        )}
      </div>

      {/* Reset Date */}
      <p className="text-xs text-warm-gray text-center mt-4">
        Credits reset on {new Date(credits.next_reset_date).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
    </div>
  );
}
