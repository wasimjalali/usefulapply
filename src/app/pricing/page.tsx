'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ArrowRight, ChevronDown, Loader2 } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { PricingAurora } from '@/components/marketing/PricingAurora';
import { useAuth } from '@/contexts/AuthContext';
import { pricingFAQs } from '@/lib/marketing/pricing-faqs';
import { CREDIT_PRICES } from '@/lib/plans';

// Single add-on credit pack
// TODO: Replace priceId value with actual Stripe Price ID
const addonPacks = [
  { name: 'Credit Pack', credits: 50, applications: 25, price: 19.99, perCredit: '$0.40', priceId: 'price_addon_credit_pack' },
];

// Time savings data for interactive calculator
const savingsTiers = [
  {
    plan: 'Free',
    apps: 2,
    hoursSaved: 2,
    price: 'Free',
    tagline: 'Two hours back, at zero cost. No card required.',
  },
  {
    plan: 'Plus',
    apps: 25,
    hoursSaved: 18,
    price: '$19.99/mo',
    tagline: 'Two full workdays back every month. Roughly 80 cents per application.',
  },
  {
    plan: 'Max',
    apps: 100,
    hoursSaved: 108,
    price: '$79.99/mo',
    tagline: 'Two and a half work weeks back every month. Roughly 80 cents per application.',
  },
];

const faqs = pricingFAQs;
const CHECKOUT_INTENT_KEY = 'usefulapply_checkout_intent';
const CHECKOUT_INTENT_TTL_MS = 60 * 60 * 1000;

// Animated counter hook
function useAnimatedCount(target: number, duration: number = 800, active: boolean = true) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (!active) { setCount(0); return; }
    const start = prevTarget.current !== target ? 0 : count;
    prevTarget.current = target;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, active, duration]);

  return count;
}

export default function PricingPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingAddon, setLoadingAddon] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [selectedSavingsTier, setSelectedSavingsTier] = useState(1); // default Plus
  const { user, profile } = useAuth();
  const router = useRouter();

  const currentSavings = savingsTiers[selectedSavingsTier];
  const animatedApps = useAnimatedCount(currentSavings.apps);
  const animatedHours = useAnimatedCount(currentSavings.hoursSaved);

  const checkoutStartedRef = useRef(false);

  const handleSubscribe = useCallback(async (planTier: 'plus' | 'max') => {
    if (!user) {
      router.push(`/auth/signup?plan=${planTier}`);
      // Note: paid plans need signup. Free tier uses /dashboard directly.
      return;
    }
    setCheckoutError(null);
    setLoadingPlan(planTier);
    try {
      let res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, planTier }),
      });
      let data = await res.json() as { url?: string; error?: string };
      if (res.status === 409) {
        res = await fetch('/api/stripe/create-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow: 'subscription_update' }),
        });
        data = await res.json() as { url?: string; error?: string };
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error || "We couldn't start checkout. Try again.");
      }
    } catch {
      setCheckoutError("We couldn't start checkout. Try again.");
    } finally {
      setLoadingPlan(null);
    }
  }, [router, user]);

  const handlePlanClick = useCallback((planTier: 'plus' | 'max') => {
    localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify({ planTier, createdAt: Date.now() }));
    if (user) localStorage.removeItem(CHECKOUT_INTENT_KEY);
    void handleSubscribe(planTier);
  }, [handleSubscribe, user]);

  useEffect(() => {
    if (!user || checkoutStartedRef.current) return;

    const checkoutTier = new URLSearchParams(window.location.search).get('checkout');
    if (checkoutTier !== 'plus' && checkoutTier !== 'max') return;

    let intendedTier: string | null = null;
    try {
      const rawIntent = localStorage.getItem(CHECKOUT_INTENT_KEY);
      const intent = rawIntent ? JSON.parse(rawIntent) as { planTier?: unknown; createdAt?: unknown } : null;
      if (
        intent
        && typeof intent.createdAt === 'number'
        && Date.now() - intent.createdAt < CHECKOUT_INTENT_TTL_MS
        && (intent.planTier === 'plus' || intent.planTier === 'max')
      ) {
        intendedTier = intent.planTier;
      }
    } catch {
      intendedTier = null;
    }
    localStorage.removeItem(CHECKOUT_INTENT_KEY);
    if (intendedTier !== checkoutTier) return;

    checkoutStartedRef.current = true;
    void handleSubscribe(checkoutTier);
  }, [handleSubscribe, user]);

  const handleBuyAddon = async (packSize: string) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    setCheckoutError(null);
    setLoadingAddon(packSize);
    try {
      const res = await fetch('/api/stripe/create-addon-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, packSize }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error || "We couldn't start checkout. Try again.");
      }
    } catch {
      setCheckoutError("We couldn't start checkout. Try again.");
    } finally {
      setLoadingAddon(null);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
      {/* Aurora-backed first-fold: hero + pricing cards share one premium backdrop */}
      <div className="relative overflow-hidden">
      <PricingAurora />
      {/* Hero Section */}
      <section className="pt-16 pb-8 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-4xl mx-auto text-center relative">
          <ScrollReveal delay={150}>
          <h1 className="font-bold text-navy-600 text-[40px] sm:text-[52px] leading-[1.08] mb-4">
            Every plan, every feature.<br /><span className="text-gold-500">Pick your volume.</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-lg text-warm-gray max-w-2xl mx-auto">
            Start free. Upgrade when you&apos;re applying every day. Cancel any time.
          </p>
          </ScrollReveal>
          <ScrollReveal delay={450}>
          <div className="mt-6 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-cream-50 border border-cream-200">
            <span className="text-warm-gray text-[13px]">
              Every word traces back to your real CV · US + EU ATS templates
            </span>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing Cards — outcome-first layout */}
      <section className="pb-20 pt-4 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {/* === FREE === */}
            <ScrollReveal delay={0} className="h-full">
            <div className="relative h-full flex flex-col rounded-2xl border border-cream-200 p-6 shadow-sm bg-cream-50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[22px] font-semibold leading-tight text-navy-800">Free</span>
              </div>
              <p className="mt-3 text-[32px] font-semibold leading-none text-navy-900">
                $0
                <span className="ml-1 text-sm font-normal text-warm-gray">/mo</span>
              </p>
              <p className="mt-5 font-semibold text-charcoal text-[15px] mb-3">What&apos;s included:</p>
              <ul className="flex-1 space-y-2.5 mb-6">
                {[
                  { label: '2 full applications a month', emphasis: true },
                  { label: 'Or 8 fit checks while you explore' },
                  { label: 'Tailored CV, cover letter, email and follow-up' },
                  { label: 'Fit analysis with match score' },
                  { label: 'Top 5 roles a day in your feed' },
                  { label: 'US and EU ATS-optimized templates' },
                  { label: 'Application tracker' },
                ].map((f) => (
                  <li key={f.label} className={`flex items-start gap-2 text-sm text-charcoal ${f.emphasis ? 'font-semibold' : ''}`}>
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-500" />
                    {f.label}
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard"
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-cream-200 bg-cream-50 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
              >
                Start free
              </Link>
            </div>
            </ScrollReveal>

            {/* === PLUS === */}
            <ScrollReveal delay={100} className="h-full">
            <div className="relative h-full flex flex-col rounded-2xl border border-gold-400 p-6 shadow-sm bg-cream-50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[22px] font-semibold leading-tight text-navy-800">Plus</span>
                <span className="rounded-full bg-gold-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                  Most popular
                </span>
              </div>
              <p className="mt-3 text-[32px] font-semibold leading-none text-navy-900">
                $19.99
                <span className="ml-1 text-sm font-normal text-warm-gray">/mo</span>
              </p>
              <p className="mt-5 font-semibold text-charcoal text-[15px] mb-3">Everything in Free, plus:</p>
              <ul className="flex-1 space-y-2.5 mb-6">
                {[
                  { label: '25 full applications a month', emphasis: true },
                  { label: 'Fit checks and rewrites from the same allowance' },
                  { label: 'Top 25 roles a day, with feed editing' },
                  { label: 'Feed searches 2 job titles across 2 countries' },
                  { label: 'Screening question answers' },
                  { label: 'Unlimited application tracker' },
                  { label: 'Top-up packs when you need more' },
                  { label: 'Priority email support' },
                ].map((f) => (
                  <li key={f.label} className={`flex items-start gap-2 text-sm text-charcoal ${f.emphasis ? 'font-semibold' : ''}`}>
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-500" />
                    {f.label}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePlanClick('plus')}
                disabled={loadingPlan === 'plus'}
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gold-400 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 cursor-pointer disabled:opacity-60"
              >
                {loadingPlan === 'plus' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go Plus'}
              </button>
            </div>
            </ScrollReveal>

            {/* === MAX === */}
            <ScrollReveal delay={200} className="h-full">
            <div className="relative h-full flex flex-col rounded-2xl border border-cream-200 p-6 shadow-sm bg-cream-50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[22px] font-semibold leading-tight text-navy-800">Max</span>
              </div>
              <p className="mt-3 text-[32px] font-semibold leading-none text-navy-900">
                $79.99
                <span className="ml-1 text-sm font-normal text-warm-gray">/mo</span>
              </p>
              <p className="mt-5 font-semibold text-charcoal text-[15px] mb-3">Everything in Plus, plus:</p>
              <ul className="flex-1 space-y-2.5 mb-6">
                {[
                  { label: '100 full applications a month', emphasis: true },
                  { label: 'Feed searches 4 job titles across 4 countries' },
                  { label: 'Built for an all-out daily search' },
                  { label: 'Premium dedicated support' },
                ].map((f) => (
                  <li key={f.label} className={`flex items-start gap-2 text-sm text-charcoal ${f.emphasis ? 'font-semibold' : ''}`}>
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-500" />
                    {f.label}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePlanClick('max')}
                disabled={loadingPlan === 'max'}
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gold-400 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 cursor-pointer disabled:opacity-60"
              >
                {loadingPlan === 'max' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go Max'}
              </button>
            </div>
            </ScrollReveal>
          </div>

          {checkoutError && (
            <p className="mt-4 text-center text-sm text-red-600" role="alert">{checkoutError}</p>
          )}

          {/* Trust line under cards */}
          <p className="mt-8 text-center text-[13px] text-warm-gray max-w-3xl mx-auto">
            Cancel anytime. No hidden fees, no lock-in contracts.
          </p>
        </div>
      </section>
      </div>
      {/* /Aurora-backed first-fold */}

      {/* Add-on credit packs — moved out of cards into a dedicated band */}
      <section className="scroll-mt-24 pb-20 px-4 sm:px-6 lg:px-8" id="addons">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
          <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6 md:p-8 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              {/* Left: label + headline + note */}
              <div className="flex-1">
                <p className="eyebrow-dot text-xs font-semibold text-gold-400 uppercase tracking-[0.12em] mb-2">
                  Need more this month?
                </p>
                <h3 className="font-bold text-white text-[24px] leading-tight mb-2">
                  Top up any time with a credit pack.
                </h3>
                <p className="text-sm text-navy-300">
                  Available on Plus and Max. Credits roll over while your subscription is active.
                </p>
              </div>

              {/* Right: credit info + buy button */}
              {addonPacks.map((pack) => (
                <div key={pack.name} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  {/* Credit count block */}
                  <div className="bg-navy-700 border border-navy-600 rounded-xl px-5 py-4 text-center sm:text-left">
                    <p className="text-[28px] font-bold text-white leading-none">{pack.credits}</p>
                    <p className="text-[13px] font-semibold text-gold-400 mt-0.5">credits</p>
                    <p className="text-[12px] text-navy-300 mt-1">{pack.applications} more applications</p>
                  </div>
                  {/* Buy button */}
                  <button
                    onClick={() => {
                      const packSize = pack.name.split(' ')[0].toLowerCase();
                      if (profile?.subscription_tier === 'free') handlePlanClick('plus');
                      else void handleBuyAddon(packSize);
                    }}
                    disabled={Boolean(user && !profile)
                      || (profile?.subscription_tier === 'free'
                        ? loadingPlan === 'plus'
                        : loadingAddon === pack.name.split(' ')[0].toLowerCase())}
                    className="cta-gold px-6 py-4 rounded-xl bg-gold-400 hover:bg-gold-500 text-white font-bold text-[18px] shadow-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 group"
                  >
                    {Boolean(user && !profile)
                      || loadingAddon === pack.name.split(' ')[0].toLowerCase()
                      || (profile?.subscription_tier === 'free' && loadingPlan === 'plus')
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <>{profile?.subscription_tier === 'free' ? 'Upgrade to Plus' : `$${pack.price}`}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
                  </button>
                </div>
              ))}
            </div>
            {checkoutError && (
              <p className="mt-4 text-sm text-red-300" role="alert">{checkoutError}</p>
            )}
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Interactive Time Savings Calculator — Warm premium design */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-200/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold-100/40 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        <div className="max-w-4xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="eyebrow-dot text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Time Savings</p>
            <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-3">
              How much time will you save?
            </h2>
            <p className="text-warm-gray max-w-lg mx-auto">
              One tailored application takes an hour by hand. Useful Apply does it in 90 seconds. Roughly 40x faster, without dropping quality.
            </p>
          </div>
          </ScrollReveal>

          <ScrollReveal delay={150}>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-lg p-8 md:p-10">
            {/* Tier Selector — pill buttons */}
            <div className="flex items-center justify-center mb-10">
              <div className="inline-flex bg-cream-100 rounded-xl p-1.5 gap-1 border border-cream-200">
                {savingsTiers.map((tier, i) => (
                  <button
                    key={tier.plan}
                    onClick={() => setSelectedSavingsTier(i)}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      i === selectedSavingsTier
                        ? 'bg-white text-navy-600 shadow-md border border-cream-200'
                        : 'text-warm-gray hover:text-navy-600 hover:bg-cream-50'
                    }`}
                  >
                    <span>{tier.plan}</span>
                    <span className="block text-xs font-normal mt-0.5 opacity-70">{tier.price}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 md:gap-6 mb-8">
              <div className="text-center p-4 md:p-6 bg-cream-50 rounded-xl border border-cream-200">
                <div className="text-3xl md:text-5xl font-bold text-navy-600 mb-2">{animatedApps}</div>
                <div className="text-sm text-warm-gray">applications a month</div>
              </div>
              <div className="text-center p-4 md:p-6 bg-cream-50 rounded-xl border border-cream-200">
                <div className="text-3xl md:text-5xl font-bold text-gold-500 mb-2">40<span className="text-2xl md:text-3xl">x</span></div>
                <div className="text-sm text-warm-gray">faster than by hand</div>
              </div>
              <div className="text-center p-4 md:p-6 bg-navy-600 rounded-xl">
                <div className="text-3xl md:text-5xl font-bold text-gold-400 mb-2">~{animatedHours}</div>
                <div className="text-sm text-gold-300 font-medium">hours saved each month</div>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-center text-lg font-medium text-navy-600 mb-2">
              {currentSavings.tagline}
            </p>

            {/* Disclaimer */}
            <p className="text-center text-sm text-warm-gray">
              Based on an hour of manual work per tailored application.
            </p>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* How Credits Work */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="eyebrow-dot text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Credit System</p>
            <h2 className="font-bold text-navy-600 text-[32px] leading-[1.1] mb-3">
              How credits work.
            </h2>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={100}>
          <p className="text-center text-[15px] text-charcoal">
            {CREDIT_PRICES}
          </p>
          </ScrollReveal>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-3xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="eyebrow-dot text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">FAQ</p>
            <h2 className="font-bold text-navy-600 text-[32px] leading-[1.1]">
              Frequently asked questions.
            </h2>
          </div>
          </ScrollReveal>
          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="bg-white border border-cream-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-cream-50 transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-charcoal pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-warm-gray flex-shrink-0 transition-transform duration-200 ${
                      expandedFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedFaq === idx && (
                  <div className="panel-rise px-5 pb-5">
                    <p className="text-warm-gray leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-navy-700 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-[0.04]" />
        <ScrollReveal>
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="font-bold text-white text-[32px] md:text-[40px] leading-[1.1] mb-4">
            Prepare your full application <span className="text-gold-400">from your real CV.</span>
          </h2>
          <p className="text-[17px] text-navy-100 mb-9 max-w-xl mx-auto">
            Choose a role, review your tailored CV, cover letter and emails, then send when you&apos;re ready.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="cta-gold px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm flex items-center justify-center text-base"
            >
              Start free
            </Link>
            <Link
              href="/"
              className="px-8 py-3.5 border border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center text-base"
            >
              Back to home
            </Link>
          </div>
          <p className="mt-4 text-sm text-navy-200">No credit card needed.</p>
        </div>
        </ScrollReveal>
      </section>
      </main>
      <Footer />
    </div>
  );
}
