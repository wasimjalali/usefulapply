'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Coins, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCredits, type UserCredits } from '@/lib/supabase/credits';
import Link from 'next/link';

interface CreditIndicatorProps {
  compact?: boolean;
}

// Custom event for credit updates (fired after API calls)
export const CREDIT_UPDATE_EVENT = 'credit-update';

export function CreditIndicator({ compact = false }: CreditIndicatorProps) {
  const { user } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isExpanded]);

  const fetchCredits = useCallback(async (silent = false) => {
    if (!user) return;
    
    if (!silent) setIsLoading(true);
    
    try {
      const { credits: userCredits } = await getUserCredits(user.id);
      if (isMountedRef.current && userCredits) {
        setCredits(userCredits);
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    } finally {
      if (isMountedRef.current && !silent) {
        setIsLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchCredits();

    // Listen for credit update events (triggered after API calls)
    const handleCreditUpdate = () => {
      fetchCredits(true); // Silent fetch - no loading state
    };

    window.addEventListener(CREDIT_UPDATE_EVENT, handleCreditUpdate);
    
    // Also listen for focus events to refresh when user returns to tab
    const handleFocus = () => {
      fetchCredits(true);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener(CREDIT_UPDATE_EVENT, handleCreditUpdate);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchCredits]);

  if (!user || isLoading) {
    return null;
  }

  const totalCredits = credits 
    ? credits.monthly_credits + credits.rollover_credits + credits.addon_credits 
    : 0;
  const maxCredits = credits?.plan_tier === 'starter' ? 10 : credits?.plan_tier === 'plus' ? 160 : 300;
  const percentRemaining = Math.min((totalCredits / maxCredits) * 100, 100);

  // Color based on remaining credits
  const getColor = () => {
    if (percentRemaining > 50) return 'text-sage-600';
    if (percentRemaining > 20) return 'text-gold-500';
    return 'text-red-500';
  };

  if (compact) {
    return (
      <Link 
        href="/settings?section=subscription"
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-cream-100 transition-colors"
        title={`${totalCredits} credits remaining`}
      >
        <Coins className={`w-4 h-4 ${getColor()}`} />
        <span className={`text-sm font-medium ${getColor()}`}>{totalCredits}</span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cream-50 hover:bg-cream-100 border border-cream-200 transition-colors cursor-pointer"
        type="button"
      >
        <Coins className={`w-4 h-4 ${getColor()}`} />
        <div className="text-left">
          <div className={`text-sm font-semibold ${getColor()}`}>
            {totalCredits} credits
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-warm-gray" />
        ) : (
          <ChevronDown className="w-4 h-4 text-warm-gray" />
        )}
      </button>

      {isExpanded && (
        <>
          {/* Mobile: Full-screen backdrop + centered modal */}
          <div className="md:hidden fixed inset-0 z-[200]">
            <div 
              className="absolute inset-0 bg-black/30"
              onClick={() => setIsExpanded(false)}
              onTouchStart={() => setIsExpanded(false)}
            />
            <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-cream-200 p-5 z-[201]">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-warm-gray">Credits Remaining</span>
                    <span className="font-semibold text-charcoal">{totalCredits}</span>
                  </div>
                  <div className="w-full bg-cream-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        percentRemaining > 50 ? 'bg-sage-500' : percentRemaining > 20 ? 'bg-gold-400' : 'bg-red-500'
                      }`}
                      style={{ width: `${percentRemaining}%` }}
                    />
                  </div>
                </div>

                <div className="text-xs space-y-1 text-warm-gray">
                  <div className="flex justify-between">
                    <span>Monthly</span>
                    <span>{credits?.monthly_credits || 0}</span>
                  </div>
                  {(credits?.rollover_credits || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Rollover</span>
                      <span>{credits?.rollover_credits}</span>
                    </div>
                  )}
                  {(credits?.addon_credits || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Add-on</span>
                      <span>{credits?.addon_credits}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-cream-200">
                  <div className="text-xs font-semibold text-charcoal mb-2">Credit Usage</div>
                  <div className="space-y-1.5 text-xs text-warm-gray">
                    <div className="flex justify-between">
                      <span>Fit Analysis</span>
                      <span className="font-medium text-charcoal">0.5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Full Application</span>
                      <span className="font-medium text-charcoal">1.5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cover Letter Regen</span>
                      <span className="font-medium text-charcoal">0.5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Email Regen</span>
                      <span className="font-medium text-charcoal">0.5</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-cream-200 space-y-2">
                  <Link
                    href="/pricing#addons"
                    className="block w-full text-center text-sm font-medium px-3 py-2.5 bg-navy-600 text-white rounded-lg hover:bg-navy-700 transition-colors"
                    onClick={() => setIsExpanded(false)}
                  >
                    Buy More Credits
                  </Link>
                  <Link
                    href="/settings?section=subscription"
                    className="block w-full text-center text-sm font-medium text-navy-600 hover:text-navy-700 transition-colors py-1"
                    onClick={() => setIsExpanded(false)}
                  >
                    Manage Subscription →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: Absolute dropdown */}
          <div className="hidden md:block absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-cream-200 p-4 z-[100]">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-warm-gray">Credits Remaining</span>
                  <span className="font-semibold text-charcoal">{totalCredits}</span>
                </div>
                <div className="w-full bg-cream-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      percentRemaining > 50 ? 'bg-sage-500' : percentRemaining > 20 ? 'bg-gold-400' : 'bg-red-500'
                    }`}
                    style={{ width: `${percentRemaining}%` }}
                  />
                </div>
              </div>

              <div className="text-xs space-y-1 text-warm-gray">
                <div className="flex justify-between">
                  <span>Monthly</span>
                  <span>{credits?.monthly_credits || 0}</span>
                </div>
                {(credits?.rollover_credits || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Rollover</span>
                    <span>{credits?.rollover_credits}</span>
                  </div>
                )}
                {(credits?.addon_credits || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Add-on</span>
                    <span>{credits?.addon_credits}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-cream-200">
                <div className="text-xs font-semibold text-charcoal mb-2">Credit Usage</div>
                <div className="space-y-1.5 text-xs text-warm-gray">
                  <div className="flex justify-between">
                    <span>Fit Analysis</span>
                    <span className="font-medium text-charcoal">0.5</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Full Application</span>
                    <span className="font-medium text-charcoal">1.5</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cover Letter Regen</span>
                    <span className="font-medium text-charcoal">0.5</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Email Regen</span>
                    <span className="font-medium text-charcoal">0.5</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-cream-200 space-y-2">
                <Link
                  href="/pricing#addons"
                  className="block w-full text-center text-sm font-medium px-3 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700 transition-colors"
                >
                  Buy More Credits
                </Link>
                <Link
                  href="/settings?section=subscription"
                  className="block w-full text-center text-sm font-medium text-navy-600 hover:text-navy-700 transition-colors"
                >
                  Manage Subscription →
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
