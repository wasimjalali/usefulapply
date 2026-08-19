'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CREDIT_UPDATE_EVENT } from '@/lib/utils/creditEvents';

export interface CreditBalance {
  monthly: number;
  rollover: number;
  addon: number;
  total: number;
  planTier: 'free' | 'plus' | 'max';
  nextResetDate: string | null;
}

export function useCreditsBalance() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user));

  const fetchCredits = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch('/api/credits/balance', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json()) as CreditBalance;
      setCredits(payload);
    } catch (error) {
      console.error('Error fetching credits:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchCredits();
    const handleCreditUpdate = () => {
      void fetchCredits();
    };
    window.addEventListener(CREDIT_UPDATE_EVENT, handleCreditUpdate);
    return () => window.removeEventListener(CREDIT_UPDATE_EVENT, handleCreditUpdate);
  }, [fetchCredits]);

  return { credits, isLoading, refresh: fetchCredits };
}

export function formatResetDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
