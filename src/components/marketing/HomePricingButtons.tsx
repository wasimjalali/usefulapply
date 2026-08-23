'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type Tier = 'plus' | 'max';

function usePlanCheckout(tier: Tier) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  const start = async () => {
    if (!user) {
      router.push(`/auth/signup?plan=${tier}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, planTier: tier }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "We couldn't open checkout. Try again.");
    } catch {
      setError("We couldn't open checkout. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return { start, loading, error };
}

const GOLD_BUTTON =
  'flex h-11 w-full items-center justify-center rounded-full bg-gold-400 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed';

const OUTLINE_BUTTON =
  'flex h-11 w-full items-center justify-center rounded-full border border-cream-200 bg-cream-50 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed';

export function PlusPlanButton() {
  const { start, loading, error } = usePlanCheckout('plus');
  return (
    <>
      <button onClick={start} disabled={loading} className={GOLD_BUTTON}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start with Plus'}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </>
  );
}

export function MaxPlanButton() {
  const { start, loading, error } = usePlanCheckout('max');
  return (
    <>
      <button onClick={start} disabled={loading} className={OUTLINE_BUTTON}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go Max'}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </>
  );
}
