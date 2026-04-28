'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Clock, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  required?: number;
  available?: number;
}

export function InsufficientCreditsModal({
  isOpen,
  onClose,
  required,
  available,
}: InsufficientCreditsModalProps) {
  const { user } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<'plus' | 'max' | null>(null);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  const portalRoot = typeof document !== 'undefined' ? document.body : null;

  if (!isOpen || !portalRoot) return null;

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Insufficient credits">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-cream-50 rounded-2xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 p-2 rounded-lg text-warm-gray hover:bg-cream-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-8 pb-6 text-center border-b border-cream-200">
          <h2 className="text-2xl font-bold text-charcoal">You&apos;re out of credits</h2>
          {required !== undefined && available !== undefined && (
            <p className="mt-2 text-warm-gray text-sm">
              This action requires <strong>{required} credits</strong>, but you only have{' '}
              <strong>{available} credit{available !== 1 ? 's' : ''}</strong> remaining.
            </p>
          )}
          <p className="mt-2 text-warm-gray text-sm">
            Upgrade to keep applying. Your CV, cover letter, email and follow-up, all tailored for every role.
          </p>
        </div>

        {/* Plan cards — matches pricing page layout exactly */}
        <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">

          {/* === PLUS === */}
          <div className="relative flex flex-col bg-cream-50 rounded-2xl border-2 border-gold-400 shadow-xl overflow-hidden">
            <div className="h-[36px] flex items-center justify-center bg-gold-400 text-navy-900 text-[11px] font-bold tracking-[0.14em]">
              MOST POPULAR
            </div>
            <div className="p-6 pt-4 flex flex-col flex-1">
              <div className="mb-4">
                <h3 className="font-bold text-navy-600 text-[20px] leading-tight">Plus</h3>
                <p className="text-sm text-warm-gray mt-0.5">For serious job seekers</p>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[36px] font-bold text-navy-600 leading-none">$19.99</span>
                  <span className="text-warm-gray text-sm">/ month</span>
                </div>
                <span className="inline-block mt-2 text-[12px] font-semibold text-gold-700 bg-gold-50 border border-gold-200 rounded-full px-3 py-0.5">
                  25 applications / month
                </span>
              </div>
              <div className="flex items-center gap-2 bg-gold-50 border border-gold-200 rounded-lg px-3 py-2 mb-4">
                <Clock className="w-4 h-4 text-gold-600 flex-shrink-0" />
                <span className="text-[13px] font-semibold text-gold-700">Save ~18 hours every month</span>
              </div>
              <button
                onClick={() => handleUpgrade('plus')}
                disabled={loadingPlan !== null}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm bg-gold-400 hover:bg-gold-500 text-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-60 mb-5 group"
              >
                {loadingPlan === 'plus'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <>Get Plus <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>
                }
              </button>
              <p className="font-bold text-charcoal text-[14px] mb-2.5">Everything in Free, plus:</p>
              <ul className="space-y-2 flex-1">
                {[
                  'Smart Job Feed: up to 15 curated roles per day',
                  'Full Fit Analysis with strengths and gaps',
                  'Unlimited application tracker',
                  'Add-on credit packs (credits roll over)',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-500" />
                    <span className="text-[13px] text-charcoal leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* === MAX === */}
          <div className="relative flex flex-col bg-navy-800 rounded-2xl border border-navy-700 overflow-hidden">
            <div className="h-[36px]" />
            <div className="p-6 pt-4 flex flex-col flex-1">
              <div className="mb-4">
                <h3 className="font-bold text-white text-[20px] leading-tight">Max</h3>
                <p className="text-sm text-navy-300 mt-0.5">For the intense job search</p>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[36px] font-bold text-white leading-none">$79.99</span>
                  <span className="text-navy-300 text-sm">/ month</span>
                </div>
                <span className="inline-block mt-2 text-[12px] font-semibold text-navy-200 bg-navy-700 border border-navy-600 rounded-full px-3 py-0.5">
                  100 applications / month
                </span>
              </div>
              <div className="flex items-center gap-2 bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 mb-4">
                <Clock className="w-4 h-4 text-gold-400 flex-shrink-0" />
                <span className="text-[13px] font-semibold text-gold-300">Save ~108 hours every month</span>
              </div>
              <button
                onClick={() => handleUpgrade('max')}
                disabled={loadingPlan !== null}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm bg-gold-400 hover:bg-gold-500 text-navy-900 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-60 mb-5 group"
              >
                {loadingPlan === 'max'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <>Get Max <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>
                }
              </button>
              <p className="font-bold text-white text-[14px] mb-2.5">Everything in Plus, plus:</p>
              <ul className="space-y-2 flex-1">
                {[
                  'Smart Job Feed: up to 25 curated roles per day',
                  'Screening question answers',
                  'Add-on credit packs (credits roll over)',
                  'Premium dedicated support',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-400" />
                    <span className="text-[13px] text-navy-100 leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
    </div>,
    portalRoot,
  );
}
