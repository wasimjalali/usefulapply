'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function PlusPlanButton() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const handleClick = async () => {
    if (!user) {
      router.push('/auth/signup?plan=plus');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, planTier: 'plus' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm bg-gold-400 hover:bg-gold-500 text-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-70 group"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Plus <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
    </button>
  );
}

export function MaxPlanButton() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const handleClick = async () => {
    if (!user) {
      router.push('/auth/signup?plan=max');
      return;
    }
    setLoading(true);
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
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm bg-navy-600 hover:bg-navy-700 text-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-70 group"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Max <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
    </button>
  );
}
