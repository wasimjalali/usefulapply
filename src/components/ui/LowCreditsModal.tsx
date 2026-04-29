'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, Crown, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CREDIT_UPDATE_EVENT } from './CreditIndicator';

const MODAL_SHOWN_KEY = 'karko_low_credits_modal_shown';

export function LowCreditsModal() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [totalCredits, setTotalCredits] = useState<number | null>(null);
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<'addon' | 'max' | null>(null);
  const isMountedRef = useRef(false);

  const fetchCredits = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/credits/balance', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { total: number; planTier: string | null };
      if (isMountedRef.current) {
        setTotalCredits(payload.total);
        setPlanTier(payload.planTier ?? null);
      }
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchCredits();
    window.addEventListener(CREDIT_UPDATE_EVENT, fetchCredits);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener(CREDIT_UPDATE_EVENT, fetchCredits);
    };
  }, [fetchCredits]);

  // Auto-open once per session when ≤5 credits (paid users only)
  useEffect(() => {
    if (totalCredits === null) return;
    const isPaid = planTier === 'plus' || planTier === 'max';
    if (!isPaid || totalCredits > 5) return;
    if (sessionStorage.getItem(MODAL_SHOWN_KEY) !== '1') {
      setIsOpen(true);
      sessionStorage.setItem(MODAL_SHOWN_KEY, '1');
    }
  }, [totalCredits, planTier]);

  const handleClose = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

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
  const portalRoot = typeof document !== 'undefined' ? document.body : null;

  if (!isOpen || !portalRoot || totalCredits === null) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Running low on credits">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-cream-50 rounded-2xl shadow-lg w-full max-w-lg">
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 p-2 rounded-lg text-warm-gray hover:bg-cream-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 pt-8 pb-5 text-center border-b border-cream-200">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-100 rounded-2xl mb-4">
            <Zap className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-charcoal">
            {totalCredits <= 0 ? "You're out of credits" : "Almost out of credits"}
          </h2>
          <p className="mt-2 text-warm-gray text-sm">
            You have <strong>{totalCredits}</strong> {totalCredits === 1 ? 'credit' : 'credits'} left.{' '}
            Top up to keep applying.
          </p>
        </div>

        <div className={`px-6 py-5 grid gap-4 ${isPlus ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Buy Add-on Credits */}
          <div className="bg-white rounded-2xl border-2 border-gold-300 shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-gold-500 text-center text-xs font-bold tracking-wide text-white">
              INSTANT TOP-UP
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-gold-100">
                  <Zap className="w-5 h-5 text-gold-500" />
                </div>
                <div>
                  <p className="font-bold text-charcoal">Add-on Credits</p>
                  <p className="text-xs text-warm-gray">One-time purchase</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-charcoal mb-0.5">
                $19.99
                <span className="text-sm font-normal text-warm-gray"> one-time</span>
              </p>
              <p className="text-xs text-warm-gray mb-4">50 credits, ~25 applications. Credits roll over.</p>
              <button
                onClick={handleAddon}
                disabled={loadingAction !== null}
                className="w-full py-3 rounded-2xl font-semibold text-sm bg-gold-400 hover:bg-gold-500 text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingAction === 'addon' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buy Credits'}
              </button>
            </div>
          </div>

          {/* Upgrade to Max — Plus only */}
          {isPlus && (
            <div className="bg-white rounded-2xl border-2 border-navy-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-navy-600 text-center text-xs font-bold tracking-wide text-white">
                200 CREDITS/MONTH
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-navy-50">
                    <Crown className="w-5 h-5 text-navy-600" />
                  </div>
                  <div>
                    <p className="font-bold text-charcoal">Max Plan</p>
                    <p className="text-xs text-warm-gray">Full automation</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-charcoal mb-0.5">
                  $79.99
                  <span className="text-sm font-normal text-warm-gray"> /month</span>
                </p>
                <p className="text-xs text-warm-gray mb-4">200 credits/month, ~100 applications.</p>
                <button
                  onClick={handleUpgradeToMax}
                  disabled={loadingAction !== null}
                  className="w-full py-3 rounded-2xl font-semibold text-sm bg-navy-600 hover:bg-navy-700 text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loadingAction === 'max' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upgrade to Max'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-5 text-center">
          <button onClick={handleClose} className="text-xs text-warm-gray hover:text-navy-600 transition-colors cursor-pointer">
            Maybe later
          </button>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
