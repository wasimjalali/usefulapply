'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Zap, ArrowRight, ChevronDown, FileText, MessageSquare, BarChart3, Loader2 } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { PricingAurora } from '@/components/marketing/PricingAurora';
import { useAuth } from '@/contexts/AuthContext';

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
    tagline: 'That is 2 hours you get back for free. No credit card required.',
  },
  {
    plan: 'Plus',
    apps: 25,
    hoursSaved: 18,
    price: '$19.99/mo',
    tagline: 'That is over 18 hours saved every month. At ~$0.80 per application.',
  },
  {
    plan: 'Max',
    apps: 100,
    hoursSaved: 108,
    price: '$79.99/mo',
    tagline: 'That is over two and a half work weeks saved. Full automation at ~$0.80 per application.',
  },
];

// FAQ items
const faqs = [
  {
    question: 'What exactly do I get with each application?',
    answer: 'Each application generates a complete package: an AI-optimized CV tailored to the job description, a personalized cover letter with company research, and a professional application email, all in under 90 seconds.',
  },
  {
    question: 'Are all features the same across plans?',
    answer: 'Yes! Every plan includes the full agentic AI workflow: AI company analysis, fit analysis, skill gap analysis, ATS-optimized templates, AI self-refinement, and PDF export. The only difference between plans is the number of monthly credits.',
  },
  {
    question: 'What happens if I run out of credits?',
    answer: 'Plus and Max subscribers can purchase add-on credit packs anytime ($19.99 for 50 credits, 25 applications). Purchased credits roll over while your subscription is active. Free tier credits reset monthly. You can also upgrade your plan for immediate access to more credits.',
  },
  {
    question: 'Do unused credits expire?',
    answer: 'Monthly credits reset each billing cycle. Add-on credits roll over as long as your subscription is active. Upgrade to Plus or Max for add-on credit packs.',
  },
  {
    question: 'Can I change or cancel my plan?',
    answer: 'Absolutely. Upgrade anytime for immediate access to more credits. Downgrade or cancel at the end of your billing cycle. No hidden fees, no lock-in contracts.',
  },
  {
    question: 'How is KarKo different from other resume builders?',
    answer: 'Most tools just help you format a resume. KarKo AI is an agentic system that analyzes the job description, extracts company insights, runs a fit analysis, generates a tailored CV, writes a personalized cover letter, and drafts professional application emails and follow-up emails — a feature no other tool offers. The entire process takes under 90 seconds.',
  },
  {
    question: 'What AI model does KarKo use?',
    answer: 'KarKo AI runs on Claude Sonnet 4.6 by Anthropic, one of the most capable AI models available for writing and agentic tasks. Unlike competitors who use cheaper open-source models, we use the same US-based, frontier-grade AI trusted by leading enterprises. On top of that, we have built a specialized system and agentic workflow designed specifically for job applications, so the model is not just powerful, it is precisely tuned to produce professional, ATS-optimized, role-specific documents.',
  },
  {
    question: 'How does Karko AI pricing compare to Teal?',
    answer: 'Teal offers a free tier but hides its paid pricing. Karko AI is fully transparent: Free (2 apps), Plus $19.99/mo (25 apps), Max $79.99/mo (100 apps). Unlike Teal, Karko generates complete application packages with emails. See our full comparison at /compare/karko-ai-vs-teal.',
  },
  {
    question: 'How does Karko AI pricing compare to Jobscan?',
    answer: 'Jobscan offers a free tier for resume scanning, but does not generate application content. Karko AI creates complete, ATS-optimized application packages (CV, cover letter, application email, follow-up email) from scratch. Different tools for different needs. See our full comparison at /compare/karko-ai-vs-jobscan.',
  },
];

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
          <ScrollReveal delay={0} direction="down" distance={20}>
          <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Pricing</p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <h1 className="font-bold text-navy-600 text-[40px] sm:text-[52px] leading-[1.08] mb-4">
            Pricing that matches <span className="text-gold-500">how much you apply.</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-lg text-warm-gray max-w-2xl mx-auto">
            Start free. Upgrade when you're applying every day. Cancel any time.
          </p>
          </ScrollReveal>
          <ScrollReveal delay={450}>
          <div className="mt-6 inline-flex items-center gap-3 px-4 py-2 rounded-full bg-cream-50 border border-cream-200">
            <Image src="/anthropic-icon.jpg" alt="Anthropic" width={20} height={20} className="rounded" />
            <span className="text-warm-gray text-[13px]">
              Every plan is powered by <span className="font-semibold text-charcoal">Claude Sonnet 4.6</span> with anti-hallucination guardrails and US + EU ATS templates.
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
            <div className="relative h-full flex flex-col bg-cream-50 rounded-2xl border border-cream-200 shadow-sm overflow-hidden">
              {/* spacer to match Plus badge height */}
              <div className="h-[36px]" />
              <div className="p-7 pt-5 flex flex-col h-full">
                <div className="mb-5">
                  <h3 className="font-bold text-navy-600 text-[22px] leading-tight">Free</h3>
                  <p className="text-sm text-warm-gray mt-0.5">Try Karko, no card required</p>
                </div>
                <h4 className="font-bold text-charcoal text-[28px] leading-[1.15] mb-5 min-h-[72px]">
                  2 tailored applications every month
                </h4>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-bold text-navy-600 leading-none">Free</span>
                    <span className="text-warm-gray text-sm">forever</span>
                  </div>
                  <p className="text-[13px] text-warm-gray mt-1">No credit card to start.</p>
                </div>
                <Link
                  href="/dashboard"
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg font-semibold text-sm border border-white/70 bg-white/60 hover:bg-white hover:border-white hover:shadow-md text-navy-600 transition-all duration-200 hover:-translate-y-0.5 mb-6 group"
                >
                  Start Free
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <p className="font-bold text-charcoal text-[15px] mb-3">What&apos;s included:</p>
                <ul className="space-y-2.5 mb-5 flex-1">
                  {[
                    'Tailored CV, cover letter, email and follow-up',
                    'Honest fit score before you apply',
                    'US and EU ATS-optimized templates',
                    'Anti-hallucination guardrails',
                    'Keep your applications forever',
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className="text-[14px] text-charcoal leading-relaxed">{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] italic text-warm-gray mt-auto">Saves you about 2 hours a month.</p>
              </div>
            </div>
            </ScrollReveal>

            {/* === PLUS === */}
            <ScrollReveal delay={100} className="h-full">
            <div className="relative h-full flex flex-col bg-cream-50 rounded-2xl border border-cream-200 shadow-md overflow-hidden">
              <div className="h-[36px] flex items-center justify-center bg-gold-400 text-navy-900 text-[11px] font-bold tracking-[0.14em]">
                MOST POPULAR
              </div>
              <div className="p-7 pt-5 flex flex-col h-full border-t-2 border-gold-400 -mt-[2px]">
                <div className="mb-5">
                  <h3 className="font-bold text-navy-600 text-[22px] leading-tight">Plus</h3>
                  <p className="text-sm text-warm-gray mt-0.5">For serious job seekers</p>
                </div>
                <h4 className="font-bold text-charcoal text-[28px] leading-[1.15] mb-5 min-h-[72px]">
                  25 tailored applications every month
                </h4>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-bold text-navy-600 leading-none">$19.99</span>
                    <span className="text-warm-gray text-sm">/ month</span>
                  </div>
                  <p className="text-[13px] text-warm-gray mt-1">About $0.80 per application.</p>
                </div>
                <button
                  onClick={() => handleSubscribe('plus')}
                  disabled={loadingPlan === 'plus'}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg font-semibold text-sm bg-gold-400 hover:bg-gold-500 text-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-60 mb-6 group"
                >
                  {loadingPlan === 'plus' ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Plus <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
                </button>
                <p className="font-bold text-charcoal text-[15px] mb-3">Everything in Free, plus:</p>
                <ul className="space-y-2.5 mb-5 flex-1">
                  {[
                    'Smart Job Feed, up to 15 roles a day',
                    'Fit Analysis before every application',
                    'Add-on credit packs (credits roll over)',
                    'Unlimited application history',
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className="text-[14px] text-charcoal leading-relaxed">{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] italic text-warm-gray mt-auto">Saves you about 18 hours a month.</p>
              </div>
            </div>
            </ScrollReveal>

            {/* === MAX === */}
            <ScrollReveal delay={200} className="h-full">
            <div className="relative h-full flex flex-col bg-cream-50 rounded-2xl border border-navy-200 shadow-sm overflow-hidden">
              <div className="h-[36px]" />
              <div className="p-7 pt-5 flex flex-col h-full">
                <div className="mb-5">
                  <h3 className="font-bold text-navy-600 text-[22px] leading-tight">Max</h3>
                  <p className="text-sm text-warm-gray mt-0.5">For the intense job search</p>
                </div>
                <h4 className="font-bold text-charcoal text-[28px] leading-[1.15] mb-5 min-h-[72px]">
                  100 tailored applications every month
                </h4>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-bold text-navy-600 leading-none">$79.99</span>
                    <span className="text-warm-gray text-sm">/ month</span>
                  </div>
                  <p className="text-[13px] text-warm-gray mt-1">About $0.80 per application.</p>
                </div>
                <button
                  onClick={() => handleSubscribe('max')}
                  disabled={loadingPlan === 'max'}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg font-semibold text-sm bg-navy-600 hover:bg-navy-700 text-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-60 mb-6 group"
                >
                  {loadingPlan === 'max' ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Max <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>}
                </button>
                <p className="font-bold text-charcoal text-[15px] mb-3">Everything in Plus, plus:</p>
                <ul className="space-y-2.5 mb-5 flex-1">
                  {[
                    'Smart Job Feed, up to 25 roles a day',
                    'AI screening question answers',
                    'Add-on credit packs (credits roll over)',
                    'Premium dedicated support',
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className="text-[14px] text-charcoal leading-relaxed">{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] italic text-warm-gray mt-auto">Saves you about 108 hours a month.</p>
              </div>
            </div>
            </ScrollReveal>
          </div>

          {/* Trust line under cards */}
          <p className="mt-8 text-center text-[13px] text-warm-gray max-w-3xl mx-auto">
            Every plan includes the full agentic workflow, anti-hallucination guardrails, US + EU ATS templates,
            a built-in application tracker, and cancel-anytime billing.
          </p>
        </div>
      </section>
      </div>
      {/* /Aurora-backed first-fold */}

      {/* Add-on credit packs — moved out of cards into a dedicated band */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8" id="addons">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
          <div className="bg-cream-50 border border-cream-200 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div>
                <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-2">
                  Need more this month?
                </p>
                <h3 className="font-bold text-navy-600 text-[22px] leading-tight mb-1">
                  Top up any time with a credit pack.
                </h3>
                <p className="text-sm text-warm-gray">
                  Available on Plus and Max. Purchased credits roll over while your subscription is active.
                </p>
              </div>
              <div className="flex items-center gap-4">
                {addonPacks.map((pack) => (
                  <div key={pack.name} className="flex items-center gap-4 bg-white rounded-lg border border-cream-200 px-4 py-3">
                    <div>
                      <p className="text-[15px] font-semibold text-charcoal">{pack.credits} credits</p>
                      <p className="text-[12px] text-warm-gray">{pack.applications} more applications</p>
                    </div>
                    <button
                      onClick={() => handleBuyAddon(pack.name.split(' ')[0].toLowerCase())}
                      disabled={loadingAddon === pack.name.split(' ')[0].toLowerCase()}
                      className="px-4 py-2 rounded-lg bg-navy-600 hover:bg-navy-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {loadingAddon === pack.name.split(' ')[0].toLowerCase()
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <>${pack.price}</>}
                    </button>
                  </div>
                ))}
              </div>
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
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Time Savings</p>
            <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-3">
              How much time will you save?
            </h2>
            <p className="text-warm-gray max-w-lg mx-auto">
              Each tailored application takes 45-60 minutes by hand. KarKo AI does it in under 90 seconds.
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
                <div className="text-sm text-warm-gray">applications/month</div>
              </div>
              <div className="text-center p-4 md:p-6 bg-cream-50 rounded-xl border border-cream-200">
                <div className="text-3xl md:text-5xl font-bold text-gold-500 mb-2">&lt;90</div>
                <div className="text-sm text-warm-gray">seconds each</div>
              </div>
              <div className="text-center p-4 md:p-6 bg-navy-600 rounded-xl">
                <div className="text-3xl md:text-5xl font-bold text-gold-400 mb-2">~{animatedHours}</div>
                <div className="text-sm text-gold-300 font-medium">hours saved/month</div>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-center text-lg font-medium text-navy-600 mb-2">
              {currentSavings.tagline}
            </p>

            {/* Disclaimer */}
            <p className="text-center text-sm text-warm-gray">
              Based on 45-60 min of manual work per tailored application.
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
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Credit System</p>
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
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">FAQ</p>
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
                  <div className="px-5 pb-5">
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
            Start with 2 free applications. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center text-base"
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
