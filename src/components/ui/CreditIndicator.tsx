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
  const applicationsRemaining = Math.floor(totalCredits / 2);
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
        href="/settings"
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-cream-100 transition-colors"
        title={`${totalCredits} credits remaining`}
      >
        <Coins className={`w-4 h-4 ${getColor()}`} />
        <span className={`text-sm font-medium ${getColor()}`}>{totalCredits}</span>
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cream-50 hover:bg-cream-100 border border-cream-200 transition-colors"
      >
        <Coins className={`w-4 h-4 ${getColor()}`} />
        <div className="text-left">
          <div className={`text-sm font-semibold ${getColor()}`}>
            {totalCredits} credits
          </div>
          <div className="text-xs text-warm-gray">
            ~{applicationsRemaining} apps left
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-warm-gray" />
        ) : (
          <ChevronDown className="w-4 h-4 text-warm-gray" />
        )}
      </button>

      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-cream-200 p-4 z-50">
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
              <div className="text-xs text-warm-gray mb-2">
                1 application = 2 credits
              </div>
              <Link
                href="/settings"
                className="block w-full text-center text-sm font-medium text-navy-600 hover:text-navy-700 transition-colors"
              >
                Manage Credits →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
