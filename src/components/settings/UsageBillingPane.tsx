'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';
import { getSubscription, type Subscription } from '@/lib/supabase/accounts';
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
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<'idle' | 'processing' | 'complete' | 'delayed'>('idle');
  // Until the first load lands, `credits` is null and the pane would guess
  // "free", flashing the wrong plan at a paying user. Hold a spinner instead.
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return null;
    try {
      const [creditsResult, txResult, subscriptionResult] = await Promise.all([
        getUserCredits(user.id),
        getCreditTransactions(user.id, 200),
        getSubscription(user.id),
      ]);
      if (creditsResult.credits) setCredits(creditsResult.credits);
      setSubscription(subscriptionResult);
      const nextTransactions = txResult.transactions ?? [];
      setTransactions(nextTransactions);
      return { credits: creditsResult.credits, transactions: nextTransactions };
    } catch {
      setError("We couldn't load your usage. Try again in a moment.");
      return null;
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // Coming back from the Stripe portal or another window, the numbers here
  // can be stale.
  useEffect(() => {
    const refetch = () => { void load(); };
    window.addEventListener('focus', refetch);
    return () => window.removeEventListener('focus', refetch);
  }, [load]);

  // Coming back from Stripe checkout the webhook may not have landed yet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionReturn = params.get('success') === 'true' && Boolean(params.get('session_id'));
    const addonReturn = params.get('addon_success') === 'true' && Boolean(params.get('session_id'));
    if (!subscriptionReturn && !addonReturn) return;

    const expectedPlan = params.get('plan');
    const checkoutSessionId = params.get('session_id');
    setCheckoutStatus('processing');

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const clearCheckoutParams = () => {
      const nextParams = new URLSearchParams(window.location.search);
      for (const key of ['settings', 'success', 'addon_success', 'session_id', 'plan']) {
        nextParams.delete(key);
      }
      const query = nextParams.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    };

    const poll = async () => {
      attempts += 1;
      const result = await load();
      if (cancelled) return;

      const subscriptionReady = subscriptionReturn
        && (expectedPlan === 'plus' || expectedPlan === 'max')
        && result?.credits?.plan_tier === expectedPlan;
      const addonReady = addonReturn
        && result?.transactions.some((transaction) => transaction.metadata?.stripeSessionId === checkoutSessionId);

      if (subscriptionReady || addonReady) {
        setCheckoutStatus('complete');
        triggerCreditUpdate();
        clearCheckoutParams();
        return;
      }

      if (attempts < 8) {
        timer = setTimeout(() => { void poll(); }, 2000);
      } else {
        setCheckoutStatus('delayed');
        clearCheckoutParams();
      }
    };
    timer = setTimeout(() => { void poll(); }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  const tier = credits?.plan_tier ?? 'free';
  const isFree = tier === 'free';
  const total = credits ? getTotalCredits(credits) : 0;
  const allowance = Math.max(PLAN_ALLOWANCE[tier] ?? 4, total);
  const resets = formatDay(credits?.next_reset_date, datePrefs);
  const planEnds = formatDay(subscription?.current_period_end, datePrefs);

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

  // Same-tab navigation, like checkout. The old version pre-opened a tab
  // with window.open(..., 'noopener'), which returns null by spec even when
  // the tab opens, so the blank tab was orphaned and the current page
  // navigated too. The portal's return URL brings the user back here.
  const handlePortal = async (body: Record<string, unknown> = {}) => {
    setError(null);
    setBusy('portal');
    try {
      const data = await post('/api/stripe/create-portal', body);
      if (data.url) window.location.href = data.url;
      else {
        setError("We couldn't open the billing portal. Try again.");
        setBusy(null);
      }
    } catch {
      setError("We couldn't open the billing portal. Try again.");
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
        setError("We couldn't start the checkout. Try again.");
        setBusy(null);
      }
    } catch {
      setError("We couldn't start the checkout. Try again.");
      setBusy(null);
    }
  };

  const upgradeTarget = isFree ? 'plus' : tier === 'plus' ? 'max' : null;
  // The bar fills with what the month has used, so it grows as credits go.
  const percent = allowance > 0 ? Math.min(100, Math.max(0, ((allowance - total) / allowance) * 100)) : 0;

  if (!loaded) {
    return (
      <div>
        <PaneHeading>Usage &amp; Billing</PaneHeading>
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PaneHeading>Usage &amp; Billing</PaneHeading>

      {checkoutStatus !== 'idle' && (
        <div
          className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink"
          role="status"
        >
          {checkoutStatus === 'processing' && <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-ink-accent" />}
          <p>
            {checkoutStatus === 'processing' && 'Your payment is processing. Your plan and credits will update here.'}
            {checkoutStatus === 'complete' && 'Your payment is confirmed. Your plan and credits are up to date.'}
            {checkoutStatus === 'delayed' && 'Your payment is still processing. Refresh in a moment.'}
          </p>
        </div>
      )}

      <Caption>USAGE</Caption>
      <div className="rounded-card border border-border bg-surface px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm text-ink-body">
            <strong className="font-semibold">{tidy(total)} of {tidy(allowance)} credits</strong> left this month
          </p>
          {resets && <p className="text-xs text-ink-muted">Resets {resets}</p>}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-sunken">
          <div className="h-full rounded-pill bg-accent" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-xs text-ink-muted">{spendLine}</p>
      </div>

      <Caption>BILLING</Caption>
      <RowGroup>
        {isFree ? (
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Free plan</p>
              <p className="mt-0.5 text-xs text-ink-muted">Four credits a month, top-5 daily feed. Upgrade below to get more.</p>
            </div>
            <span className="flex-shrink-0 text-sm text-ink-muted">No card on file</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{PLAN_LABEL[tier]}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {PLAN_PRICE[tier]}
                  {subscription?.cancel_at_period_end && planEnds
                    ? ` · plan ends ${planEnds}`
                    : resets ? ` · next invoice ${resets}` : ''}
                  {' · invoices and card in Manage billing'}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === 'portal'}
                onClick={() => { void handlePortal(); }}
                className="inline-flex h-9 flex-shrink-0 items-center rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:text-ink-muted cursor-pointer"
              >
                Manage billing
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Credit pack</p>
                <p className="mt-0.5 text-xs text-ink-muted">50 extra credits, they roll over while you&apos;re subscribed.</p>
              </div>
              <button
                type="button"
                disabled={busy === 'addon'}
                onClick={() => { void handleCheckout('/api/stripe/create-addon-checkout', { packSize: 'credit pack' }, 'addon'); }}
                className="inline-flex h-9 flex-shrink-0 items-center rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:text-ink-muted cursor-pointer"
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
              className={`flex flex-col rounded-card border p-4 ${
                isTarget ? 'border-border-accent-soft bg-accent-soft' : 'border-border bg-surface'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">{plan.name}</span>
                {isCurrent && (
                  <span className="inline-flex items-center rounded-pill bg-sunken px-2 py-0.5 text-[11px] font-semibold text-brand-strong">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[22px] font-semibold leading-none text-ink-strong">
                {plan.price}
                <span className="ml-1 font-sans text-xs font-normal text-ink-muted">{plan.per}</span>
              </p>
              <p className="mt-2 text-[13px] font-semibold text-ink-accent">{plan.credits}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{plan.settingsLine}</p>
              <div className="mt-auto pt-3">
                {isTarget && (
                  <button
                    type="button"
                    disabled={busy === (isFree ? 'plan' : 'portal')}
                    onClick={() => {
                      if (isFree) void handleCheckout('/api/stripe/create-checkout', { planTier: plan.tier }, 'plan');
                      else void handlePortal({ flow: 'subscription_update' });
                    }}
                    className="inline-flex h-9 w-full items-center justify-center rounded-pill bg-accent px-4 text-sm font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-accent-strong disabled:opacity-60 cursor-pointer"
                  >
                    {plan.tier === 'plus' ? 'Upgrade to Plus' : 'Move to Max'}
                  </button>
                )}
                {showGoMax && (
                  <button
                    type="button"
                    disabled={busy === 'plan'}
                    onClick={() => { void handleCheckout('/api/stripe/create-checkout', { planTier: 'max' }, 'plan'); }}
                    className="inline-flex h-9 w-full items-center justify-center rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:text-ink-muted cursor-pointer"
                  >
                    Go Max
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-muted">Card via Stripe, cancel any time. Credits stay until the period ends.</p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
