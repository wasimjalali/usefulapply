'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { formatDayMonth, type DatePrefs } from '@/lib/utils/format-date';
import { PLANS, CREDIT_PRICES } from '@/lib/plans';
import {
  getUserCredits,
  getCreditTransactions,
  getTotalCredits,
  type UserCredits,
  type CreditTransaction,
} from '@/lib/supabase/credits';
import { creditTransactionKind } from '@/lib/credit-costs';
import { Caption, PaneHeading, RowGroup } from '@/components/settings/parts';

// All four derive from PLANS so a repricing in one file moves every surface.
const PLAN_ALLOWANCE: Record<string, number> = Object.fromEntries(
  PLANS.map((plan) => [plan.tier, Number.parseInt(plan.credits, 10)]),
);
const PLAN_LABEL: Record<string, string> = Object.fromEntries(
  PLANS.map((plan) => [plan.tier, `${plan.name} plan`]),
);
const PLAN_PRICE: Record<string, string> = Object.fromEntries(
  PLANS.filter((plan) => plan.tier !== 'free').map((plan) => [plan.tier, `${plan.price} ${plan.per}`]),
);

const PRICE_LIST = `${CREDIT_PRICES}.`;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function count(n: number, singular: string, plural: string) {
  const word = n <= 12 ? WORDS[n] : String(n);
  return `${word} ${n === 1 ? singular : plural}`;
}

function tidy(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatDay(iso: string | null | undefined, prefs?: DatePrefs) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDayMonth(date, prefs, 'long');
}


export function UsageBillingPane() {
  const { user } = useAuth();
  const datePrefs = useDatePrefs();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [creditsResult, txResult] = await Promise.all([
        getUserCredits(user.id),
        getCreditTransactions(user.id, 200),
      ]);
      if (creditsResult.credits) setCredits(creditsResult.credits);
      setTransactions(txResult.transactions ?? []);
    } catch {
      setError('We could not load your usage. Try again in a moment.');
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // The Stripe portal opens in a new tab, so the numbers here can be stale by
  // the time the user comes back.
  useEffect(() => {
    const refetch = () => { void load(); };
    window.addEventListener('focus', refetch);
    return () => window.removeEventListener('focus', refetch);
  }, [load]);

  // Coming back from Stripe checkout the webhook may not have landed yet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') !== 'true' && params.get('addon_success') !== 'true') return;

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      attempts += 1;
      void load();
      if (attempts < 8) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 1500);
    return () => clearTimeout(timer);
  }, [load]);

  const tier = credits?.plan_tier ?? 'free';
  const isFree = tier === 'free';
  const total = credits ? getTotalCredits(credits) : 0;
  const allowance = Math.max(PLAN_ALLOWANCE[tier] ?? 4, total);
  const resets = formatDay(credits?.next_reset_date, datePrefs);

  const spend = useMemo(() => {
    const since = credits?.last_reset_date ? new Date(credits.last_reset_date).getTime() : 0;
    let used = 0;
    let fits = 0;
    let kits = 0;
    let rewrites = 0;
    for (const tx of transactions) {
      if (tx.amount >= 0) continue;
      if (since && new Date(tx.created_at).getTime() < since) continue;
      // A charge is what the writer said it was. A negative refund is a
      // clawback of bought credits, not a thing the user spent, and an
      // unrecognised row is left out rather than counted as a rewrite.
      const kind = creditTransactionKind(tx);
      if (kind === 'refund' || kind === 'grant' || kind === null) continue;
      used += -tx.amount;
      if (kind === 'fit') fits += 1;
      else if (kind === 'kit') kits += 1;
      else rewrites += 1;
    }
    return { used, fits, kits, rewrites };
  }, [transactions, credits]);

  const spendLine = useMemo(() => {
    if (spend.used <= 0) return `Nothing spent yet this month. ${PRICE_LIST}`;
    const parts: string[] = [];
    if (spend.fits) parts.push(count(spend.fits, 'fit check', 'fit checks'));
    if (spend.kits) parts.push(count(spend.kits, 'kit', 'kits'));
    if (spend.rewrites) parts.push(count(spend.rewrites, 'rewrite', 'rewrites'));
    return `Used ${tidy(spend.used)}: ${parts.join(', ')}. ${PRICE_LIST}`;
  }, [spend]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { url?: string; error?: string };
  };

  const handlePortal = async () => {
    setError(null);
    setBusy('portal');
    // Open the tab first so the click still counts as a user gesture.
    const tab = window.open('', '_blank', 'noopener,noreferrer');
    try {
      const data = await post('/api/stripe/create-portal', {});
      if (data.url) {
        if (tab) tab.location.href = data.url;
        else window.location.href = data.url;
      } else {
        tab?.close();
        setError('We could not open the billing portal. Try again.');
      }
    } catch {
      tab?.close();
      setError('We could not open the billing portal. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleCheckout = async (path: string, body: Record<string, unknown>, key: string) => {
    setError(null);
    setBusy(key);
    try {
      const data = await post(path, body);
      if (data.url) window.location.href = data.url;
      else {
        setError('We could not start the checkout. Try again.');
        setBusy(null);
      }
    } catch {
      setError('We could not start the checkout. Try again.');
      setBusy(null);
    }
  };

  const upgradeTarget = isFree ? 'plus' : tier === 'plus' ? 'max' : null;
  // The bar fills with what the month has used, so it grows as credits go.
  const percent = allowance > 0 ? Math.min(100, Math.max(0, ((allowance - total) / allowance) * 100)) : 0;

  return (
    <div>
      <PaneHeading>Usage &amp; Billing</PaneHeading>

      <Caption>USAGE</Caption>
      <div className="rounded-2xl border border-cream-200 bg-cream-50 px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm text-charcoal">
            <strong className="font-semibold">{tidy(total)} of {tidy(allowance)} credits</strong> left this month
          </p>
          {resets && <p className="text-xs text-warm-gray">Resets {resets}</p>}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cream-200">
          <div className="h-full rounded-full bg-gold-400" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-xs text-warm-gray">{spendLine}</p>
      </div>

      <Caption>BILLING</Caption>
      <RowGroup>
        {isFree ? (
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy-800">Free plan</p>
              <p className="mt-0.5 text-xs text-warm-gray">Four credits a month, top-5 daily feed. Upgrade below to get more.</p>
            </div>
            <span className="flex-shrink-0 text-sm text-warm-gray">No card on file</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-800">{PLAN_LABEL[tier]}</p>
                <p className="mt-0.5 text-xs text-warm-gray">
                  {PLAN_PRICE[tier]}
                  {resets ? ` · next invoice ${resets}` : ''}
                  {' · invoices and card in Manage billing'}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === 'portal'}
                onClick={() => { void handlePortal(); }}
                className="inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-4 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:text-warm-gray cursor-pointer"
              >
                Manage billing
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-800">Credit pack</p>
                <p className="mt-0.5 text-xs text-warm-gray">50 extra credits, they roll over while you&apos;re subscribed.</p>
              </div>
              <button
                type="button"
                disabled={busy === 'addon'}
                onClick={() => { void handleCheckout('/api/stripe/create-addon-checkout', { packSize: 'credit pack' }, 'addon'); }}
                className="inline-flex h-9 flex-shrink-0 items-center rounded-full border border-cream-200 bg-cream-50 px-4 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:text-warm-gray cursor-pointer"
              >
                Add 50 credits · $19.99
              </button>
            </div>
          </>
        )}
      </RowGroup>

      <Caption>PLANS</Caption>
      <div className="grid grid-cols-3 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === tier;
          const isTarget = plan.tier === upgradeTarget;
          const showGoMax = isFree && plan.tier === 'max';
          return (
            <div
              key={plan.tier}
              className={`flex flex-col rounded-2xl border p-4 ${
                isTarget ? 'border-gold-200 bg-gold-50' : 'border-cream-200 bg-cream-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-navy-800">{plan.name}</span>
                {isCurrent && (
                  <span className="inline-flex items-center rounded-full bg-cream-200 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[22px] font-semibold leading-none text-navy-900">
                {plan.price}
                <span className="ml-1 font-sans text-xs font-normal text-warm-gray">{plan.per}</span>
              </p>
              <p className="mt-2 text-[13px] font-semibold text-gold-600">{plan.credits}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-warm-gray">{plan.settingsLine}</p>
              <div className="mt-auto pt-3">
                {isTarget && (
                  <button
                    type="button"
                    disabled={busy === 'plan'}
                    onClick={() => { void handleCheckout('/api/stripe/create-checkout', { planTier: plan.tier }, 'plan'); }}
                    className="inline-flex h-9 w-full items-center justify-center rounded-full bg-gold-400 px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 disabled:opacity-60 cursor-pointer"
                  >
                    {plan.tier === 'plus' ? 'Upgrade to Plus' : 'Move to Max'}
                  </button>
                )}
                {showGoMax && (
                  <button
                    type="button"
                    disabled={busy === 'plan'}
                    onClick={() => { void handleCheckout('/api/stripe/create-checkout', { planTier: 'max' }, 'plan'); }}
                    className="inline-flex h-9 w-full items-center justify-center rounded-full border border-cream-200 bg-cream-50 px-4 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:text-warm-gray cursor-pointer"
                  >
                    Go Max
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-warm-gray">Card via Stripe, cancel any time. Credits stay until the period ends.</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
