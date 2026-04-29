'use client';

import { useState, useEffect } from 'react';
import { X, Zap, Crown, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CREDIT_UPDATE_EVENT } from './CreditIndicator';

const BANNER_DISMISSED_KEY = 'karko_low_credits_banner_dismissed';

export function LowCreditsBanner() {
  const { user } = useAuth();
  const [totalCredits, setTotalCredits] = useState<number | null>(null);
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1'
  );
  const [loadingAction, setLoadingAction] = useState<'addon' | 'max' | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchCredits = async () => {
      try {
        const response = await fetch('/api/credits/balance', { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const payload = await response.json() as { total: number; planTier: string | null };
        if (cancelled) return;
        setTotalCredits(payload.total);
        setPlanTier(payload.planTier ?? null);
      } catch {
        // silent
      }
    };

    // First fetch scheduled via microtask so the setState calls land after
    // the effect body returns (satisfies react-hooks/set-state-in-effect
    // and matches how the CREDIT_UPDATE_EVENT-triggered calls behave).
    queueMicrotask(fetchCredits);
    window.addEventListener(CREDIT_UPDATE_EVENT, fetchCredits);

    return () => {
      cancelled = true;
      window.removeEventListener(CREDIT_UPDATE_EVENT, fetchCredits);
    };
  }, [user]);

  const handleDismiss = () => {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const handleAddon = async () => {
    if (!user) return;
    setLoadingAction('addon');
    try {
      const res = await fetch('/api/stripe/create-addon-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Could not start checkout. Please try again.');
        setLoadingAction(null);
      }
    } catch {
      alert('Something went wrong. Please try again.');
      setLoadingAction(null);
    }
  };

  const handleUpgradeToMax = async () => {
    if (!user) return;
    setLoadingAction('max');
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, planTier: 'max' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Could not start checkout. Please try again.');
        setLoadingAction(null);
      }
    } catch {
      alert('Something went wrong. Please try again.');
      setLoadingAction(null);
    }
  };

  const isPlus = planTier === 'plus';
  const isMax = planTier === 'max';
  const isPaid = isPlus || isMax;

  if (!isPaid || totalCredits === null || totalCredits > 15 || dismissed) return null;

  return (
    <div className="w-full bg-cream-50 border-b border-gold-200 px-4 py-2 flex items-center gap-3 text-sm flex-shrink-0 z-40">
      <Zap className="w-4 h-4 text-gold-500 flex-shrink-0" />
      <span className="text-navy-700 font-medium flex-1 min-w-0">
        You have <strong>{totalCredits}</strong> {totalCredits === 1 ? 'credit' : 'credits'} left.
        {totalCredits <= 5 ? ' Almost out.' : ' Running low.'}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleAddon}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1 bg-gold-400 hover:bg-gold-500 text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-60 cursor-pointer"
        >
          {loadingAction === 'addon' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Buy Credits
        </button>
        {isPlus && (
          <button
            onClick={handleUpgradeToMax}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1 bg-navy-600 hover:bg-navy-700 text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-60 cursor-pointer"
          >
            {loadingAction === 'max' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3 h-3" />}
            Upgrade to Max
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="p-1 rounded-full text-warm-gray hover:bg-cream-100 transition-colors cursor-pointer flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
