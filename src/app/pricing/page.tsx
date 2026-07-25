'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Zap, ArrowRight, ChevronDown, FileText, MessageSquare, BarChart3, Loader2, Clock } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { PricingAurora } from '@/components/marketing/PricingAurora';
import { useAuth } from '@/contexts/AuthContext';
import { pricingFAQs } from '@/lib/marketing/pricing-faqs';

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
  const [selectedSavingsTier, setSelectedSavingsTier] = useState(1); // default Plus
  const { user } = useAuth();
  const router = useRouter();

  const currentSavings = savingsTiers[selectedSavingsTier];
  const animatedApps = useAnimatedCount(currentSavings.apps);
  const animatedHours = useAnimatedCount(currentSavings.hoursSaved);

  const handleSubscribe = async (planTier: string) => {
    if (!user) {
      router.push(`/auth/signup?plan=${planTier}`);
      // Note: paid plans need signup. Free tier uses /dashboard directly.
      return;
    }
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
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleBuyAddon = async (packSize: string) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
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
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Something went wrong. Please try again.');
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
            <div className="relative h-full flex flex-col bg-cream-50 rounded-2xl border border-navy-200 shadow-sm overflow-hidden">
              <div className="h-[36px]" />
              <div className="p-7 pt-5 flex flex-col h-full">
                <div className="mb-4">
                  <h3 className="font-bold text-navy-600 text-[22px] leading-tight">Free</h3>
                  <p className="text-sm text-warm-gray mt-0.5">For testing the waters</p>
                </div>
                <div className="mb-5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-bold text-navy-600 leading-none">$0</span>
                    <span className="text-warm-gray text-sm">/ month</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-navy-50 border border-navy-100 rounded-lg px-3 py-2 mb-5">
                  <Clock className="w-4 h-4 text-navy-500 flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-navy-700">Save ~2 hours every month</span>
                </div>
                <Link
                  href="/dashboard"
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg font-semibold text-sm border border-navy-300 bg-white hover:bg-navy-50 hover:border-navy-400 hover:shadow-md text-navy-600 transition-all duration-200 hover:-translate-y-0.5 mb-6 group"
                >
                  Start Free
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <p className="font-bold text-charcoal text-[15px] mb-3">What&apos;s included:</p>
                <ul className="space-y-2.5 flex-1">
                  {[
                    { label: '4 credits per month', emphasis: true },
                    { label: '2 full applications per month' },
                    { label: 'Tailored CV, cover letter, email, follow-up' },
                    { label: 'Fit analysis with match score' },
                    { label: 'US and EU ATS-optimized templates' },
                    { label: 'Application tracker' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className={`text-[14px] text-charcoal leading-relaxed ${f.emphasis ? 'font-semibold' : ''}`}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </ScrollReveal>

            {/* === PLUS === */}
            <ScrollReveal delay={100} className="h-full">
            <div className="relative h-full flex flex-col bg-cream-50 rounded-2xl border-2 border-gold-400 shadow-xl overflow-hidden">
              <div className="h-[36px] flex items-center justify-center bg-gold-400 text-white text-[11px] font-bold tracking-[0.14em]">
                MOST POPULAR
              </div>
              <div className="p-7 pt-5 flex flex-col h-full">
                <div className="mb-4">
                  <h3 className="font-bold text-navy-600 text-[22px] leading-tight">Plus</h3>
                  <p className="text-sm text-warm-gray mt-0.5">For applying every week</p>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-bold text-navy-600 leading-none">$19.99</span>
                    <span className="text-warm-gray text-sm">/ month</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-gold-50 border border-gold-200 rounded-lg px-3 py-2 mb-5">
                  <Clock className="w-4 h-4 text-gold-600 flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-gold-700">Save ~18 hours every month</span>
                </div>
                <button
                  onClick={() => handleSubscribe('plus')}
                  disabled={loadingPlan === 'plus'}
                  className="cta-gold w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg font-semibold text-sm bg-gold-400 hover:bg-gold-500 text-white shadow-sm cursor-pointer disabled:opacity-60 mb-6 group"
                >
                  {loadingPlan === 'plus' ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Plus <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
                </button>
                <p className="font-bold text-charcoal text-[15px] mb-3">Everything in Free, plus:</p>
                <ul className="space-y-2.5 mb-5 flex-1">
                  {[
                    { label: '50 credits per month', emphasis: true },
                    { label: '25 full applications per month' },
                    { label: 'Smart Job Feed: up to 25 roles a day' },
                    { label: 'Feed searches 2 job titles across 2 countries' },
                    { label: 'Screening question answers' },
                    { label: 'Unlimited application tracker' },
                    { label: 'Add-on credit packs (credits roll over)' },
                    { label: 'Priority email support' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className={`text-[14px] text-charcoal leading-relaxed ${f.emphasis ? 'font-semibold' : ''}`}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </ScrollReveal>

            {/* === MAX === */}
            <ScrollReveal delay={200} className="h-full">
            <div className="relative h-full flex flex-col bg-navy-800 rounded-2xl border border-navy-700 shadow-sm overflow-hidden">
              <div className="h-[36px]" />
              <div className="p-7 pt-5 flex flex-col h-full">
                <div className="mb-4">
                  <h3 className="font-bold text-white text-[22px] leading-tight">Max</h3>
                  <p className="text-sm text-navy-300 mt-0.5">For applying every day</p>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-bold text-white leading-none">$79.99</span>
                    <span className="text-navy-300 text-sm">/ month</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 mb-5">
                  <Clock className="w-4 h-4 text-gold-400 flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-gold-300">Save ~108 hours every month</span>
                </div>
                <button
                  onClick={() => handleSubscribe('max')}
                  disabled={loadingPlan === 'max'}
                  className="cta-gold w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg font-semibold text-sm bg-gold-400 hover:bg-gold-500 text-white shadow-sm cursor-pointer disabled:opacity-60 mb-6 group"
                >
                  {loadingPlan === 'max' ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Max <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
                </button>
                <p className="font-bold text-white text-[15px] mb-3">Everything in Plus, plus:</p>
                <ul className="space-y-2.5 mb-5 flex-1">
                  {[
                    { label: '200 credits per month', emphasis: true },
                    { label: '100 full applications per month' },
                    { label: 'Feed searches 4 job titles across 4 countries' },
                    { label: 'Premium dedicated support' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-400" />
                      <span className={`text-[14px] text-navy-100 leading-relaxed ${f.emphasis ? 'font-semibold' : ''}`}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </ScrollReveal>
          </div>

          {/* Trust line under cards */}
          <p className="mt-8 text-center text-[13px] text-warm-gray max-w-3xl mx-auto">
            Cancel anytime. No hidden fees, no lock-in contracts.
          </p>
        </div>
      </section>
      </div>
      {/* /Aurora-backed first-fold */}

      {/* Add-on credit packs — moved out of cards into a dedicated band */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8" id="addons">
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
                    onClick={() => handleBuyAddon(pack.name.split(' ')[0].toLowerCase())}
                    disabled={loadingAddon === pack.name.split(' ')[0].toLowerCase()}
                    className="cta-gold px-6 py-4 rounded-xl bg-gold-400 hover:bg-gold-500 text-white font-bold text-[18px] shadow-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 group"
                  >
                    {loadingAddon === pack.name.split(' ')[0].toLowerCase()
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <>${pack.price}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
                  </button>
                </div>
              ))}
            </div>
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
              One tailored application takes an hour by hand. Karko does it in 90 seconds. Roughly 40x faster, without dropping quality.
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
            <p className="text-warm-gray max-w-xl mx-auto">
              Credits are simple. Each action costs a fixed number of credits. No surprises.
            </p>
          </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: BarChart3, credits: '0.5', label: 'Fit Analysis', sub: 'Job fit score + skill gaps', gradient: 'from-navy-500 to-navy-600', iconBg: 'bg-gradient-to-br from-navy-50 to-navy-100', iconColor: 'text-navy-600' },
              { icon: FileText, credits: '2', label: 'Full Application', sub: 'CV + Cover Letter + Email', gradient: 'from-gold-400 to-gold-500', iconBg: 'bg-gradient-to-br from-gold-50 to-gold-100', iconColor: 'text-gold-500' },
              { icon: MessageSquare, credits: '0.5', label: 'Cover Letter Regen', sub: 'Regenerate with new tone', gradient: 'from-gold-500 to-gold-600', iconBg: 'bg-gradient-to-br from-gold-50 to-gold-100', iconColor: 'text-gold-600' },
              { icon: Zap, credits: '0.5', label: 'Email Regen', sub: 'Regenerate application email', gradient: 'from-navy-600 to-navy-700', iconBg: 'bg-gradient-to-br from-gold-50 to-gold-100', iconColor: 'text-gold-600' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <ScrollReveal key={idx} delay={idx * 100}>
                <div className="text-center p-8 bg-white rounded-2xl border border-cream-200 card-hover-lift relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${item.gradient}`} />
                  <div className={`w-14 h-14 ${item.iconBg} rounded-xl flex items-center justify-center mx-auto mb-4`}>
                    <Icon className={`w-7 h-7 ${item.iconColor}`} />
                  </div>
                  <div className="text-3xl font-bold text-navy-600 mb-1">{item.credits}</div>
                  <div className="text-sm font-semibold text-charcoal mb-2">credits</div>
                  <div className="text-sm font-medium text-charcoal">{item.label}</div>
                  <div className="text-xs text-warm-gray mt-2">{item.sub}</div>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
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
            Your next interview is <span className="text-gold-400">90 seconds away.</span>
          </h2>
          <p className="text-[17px] text-navy-100 mb-9 max-w-xl mx-auto">
            Upload your CV. Pick a role from your feed. Send your first full application before your coffee gets cold.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="cta-gold px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm flex items-center justify-center text-base"
            >
              Start free, no credit card
            </Link>
            <Link
              href="/"
              className="px-8 py-3.5 border border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center text-base"
            >
              Back to home
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>
      </main>
      <Footer />
    </div>
  );
}
