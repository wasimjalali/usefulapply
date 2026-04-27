'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Sparkles, Zap, Crown, ArrowRight, ChevronDown, FileText, MessageSquare, BarChart3, Clock, Plus as PlusIcon, Loader2 } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
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
  const [expandedAddon, setExpandedAddon] = useState<string | null>(null);
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
      {/* Hero Section */}
      <section className="pt-16 pb-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="absolute top-[-100px] right-[-50px] w-[400px] h-[400px] bg-gradient-to-bl from-gold-200/30 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <ScrollReveal delay={0} direction="down" distance={20}>
          <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Pricing</p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <h1 className="text-4xl sm:text-5xl font-bold text-navy-600 mb-4 leading-tight">
            Simple, Transparent{' '}
            <span className="bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-shimmer">Pricing</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto">
            Every plan includes the full AI agent. Upgrade for more volume and automation.
          </p>
          </ScrollReveal>
          <ScrollReveal delay={450}>
          <div className="mt-6 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/80 backdrop-blur-sm border border-gold-300/60 shadow-sm">
            <Image src="/anthropic-icon.jpg" alt="Anthropic" width={28} height={28} className="rounded-md" />
            <span className="text-navy-600 text-sm font-semibold">Claude Sonnet 4.6 by Anthropic</span>
            <span className="w-px h-4 bg-cream-300" />
            <span className="text-warm-gray text-sm">Specialized for job applications · All plans</span>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 pt-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 md:gap-8 items-stretch">
            {/* Free */}
            <ScrollReveal delay={0} className="h-full">
            <div className="relative bg-white rounded-2xl border-2 border-cream-200 shadow-md overflow-hidden card-hover-lift h-full">
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-xl bg-cream-100">
                    <Sparkles className="w-6 h-6 text-navy-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-charcoal">Free</h3>
                    <p className="text-sm text-warm-gray">Try the full AI agent</p>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-navy-600">Free</span>
                    <span className="text-warm-gray">forever</span>
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-cream-100 text-navy-500 border border-cream-300">
                      4 credits/month
                    </span>
                  </div>
                </div>
                <ul className="space-y-3 mb-5">
                  {[
                    { text: '2 complete applications/month', bold: true },
                    { text: 'Tailored CV, cover letter, email & follow-up' },
                    { text: 'Honest fit score before you apply' },
                    { text: 'ATS-optimized, US & EU templates' },
                    { text: 'Anti-hallucination guardrails' },
                    { text: 'Powered by Claude Sonnet 4.6' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>{f.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-cream-50 border border-cream-200">
                  <Clock className="w-5 h-5 flex-shrink-0 text-navy-400" />
                  <span className="text-sm font-semibold text-navy-600">~2 hours saved/month</span>
                </div>
                <div className="mt-auto pt-6">
                  <Link
                    href="/dashboard"
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all border-2 border-navy-200 text-navy-600 hover:bg-navy-50 hover:border-navy-400"
                  >
                    Start Free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
            </ScrollReveal>

            {/* Plus */}
            <ScrollReveal delay={150} className="h-full">
            <div className="relative h-full">
              <div className="animated-border rounded-2xl shadow-xl h-full flex flex-col">
                <div className="bg-gradient-to-r from-gold-400 to-gold-500 text-white text-xs font-bold px-4 py-2 text-center rounded-t-2xl">
                  MOST POPULAR | SAVE ~18 HOURS/MONTH
                </div>
                <div className="p-8 flex flex-col flex-1 bg-white rounded-b-2xl">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 rounded-xl bg-gold-100">
                      <Zap className="w-6 h-6 text-gold-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-charcoal">Plus</h3>
                      <p className="text-sm text-warm-gray">For serious job seekers</p>
                    </div>
                  </div>
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-navy-600">$19.99</span>
                      <span className="text-warm-gray">/month</span>
                    </div>
                    <div className="mt-2">
                      <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-gold-50 text-gold-600 border border-gold-200">
                        50 credits/month
                      </span>
                    </div>
                  </div>
                  {/* Add-on expandable */}
                  <div className="mb-6">
                    <button
                      onClick={() => setExpandedAddon(expandedAddon === 'plus' ? null : 'plus')}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-cream-200 hover:border-gold-300 hover:bg-cream-50 transition-all cursor-pointer"
                    >
                      <span className="text-sm font-medium text-charcoal flex items-center gap-2">
                        <PlusIcon className="w-4 h-4 text-gold-500" />
                        Need more credits?
                      </span>
                      <ChevronDown className={`w-4 h-4 text-warm-gray transition-transform duration-200 ${expandedAddon === 'plus' ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedAddon === 'plus' && (
                      <div className="mt-3 p-4 bg-cream-50 rounded-xl border border-cream-200 space-y-3">
                        <p className="text-xs font-medium text-charcoal mb-2">Buy add-on credit packs:</p>
                        {addonPacks.map((pack) => (
                          <div key={pack.name} className="flex items-center justify-between">
                            <span className="text-sm text-charcoal">{pack.credits} credits ({pack.applications} apps)</span>
                            <button
                              onClick={() => handleBuyAddon(pack.name.split(' ')[0].toLowerCase())}
                              disabled={loadingAddon === pack.name.split(' ')[0].toLowerCase()}
                              className="px-3 py-1.5 bg-navy-600 text-white text-xs font-semibold rounded-lg hover:bg-navy-700 transition-colors cursor-pointer disabled:opacity-60"
                            >
                              {loadingAddon === pack.name.split(' ')[0].toLowerCase() ? <Loader2 className="w-3 h-3 animate-spin" /> : `$${pack.price}`}
                            </button>
                          </div>
                        ))}
                        <p className="text-xs text-warm-gray pt-1">Credits roll over while subscription is active.</p>
                      </div>
                    )}
                  </div>
                  <ul className="space-y-3 mb-5">
                    {[
                      { text: '25 complete applications/month', bold: true },
                      { text: 'Everything in Free, plus:' },
                      { text: 'Unlimited application history' },
                      { text: 'Add-on credit packs (rollover)' },
                      { text: 'Priority email support' },
                      { text: 'Powered by Claude Sonnet 4.6' },
                    ].map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-gold-500" />
                        <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-gold-50 border border-gold-200">
                    <Clock className="w-5 h-5 flex-shrink-0 text-gold-500" />
                    <span className="text-sm font-semibold text-navy-600">Cancel anytime. No contracts.</span>
                  </div>
                  <div className="mt-auto pt-6">
                    <button
                      onClick={() => handleSubscribe('plus')}
                      disabled={loadingPlan === 'plus'}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all cursor-pointer disabled:opacity-60 bg-gradient-to-r from-gold-400 to-gold-500 text-white hover:from-gold-500 hover:to-gold-600 shadow-md hover:shadow-lg"
                    >
                      {loadingPlan === 'plus' ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Get Plus <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </ScrollReveal>

            {/* Max */}
            <ScrollReveal delay={300} className="h-full">
            <div className="relative bg-white rounded-2xl border-2 border-navy-400 shadow-lg overflow-hidden card-hover-lift h-full flex flex-col">
              <div className="bg-gradient-to-r from-navy-600 to-navy-700 text-white text-xs font-bold px-4 py-2 text-center">
                SAVE ~108 HOURS EVERY MONTH
              </div>
              <div className="p-8 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-xl bg-navy-100">
                    <Crown className="w-6 h-6 text-navy-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-charcoal">Max</h3>
                    <p className="text-sm text-warm-gray">Full automation for power applicants</p>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-navy-600">$79.99</span>
                    <span className="text-warm-gray">/month</span>
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-navy-50 text-navy-600 border border-navy-200">
                      200 credits/month
                    </span>
                  </div>
                </div>
                {/* Add-on expandable */}
                <div className="mb-6">
                  <button
                    onClick={() => setExpandedAddon(expandedAddon === 'max' ? null : 'max')}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-cream-200 hover:border-gold-300 hover:bg-cream-50 transition-all cursor-pointer"
                  >
                    <span className="text-sm font-medium text-charcoal flex items-center gap-2">
                      <PlusIcon className="w-4 h-4 text-gold-500" />
                      Need more credits?
                    </span>
                    <ChevronDown className={`w-4 h-4 text-warm-gray transition-transform duration-200 ${expandedAddon === 'max' ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedAddon === 'max' && (
                    <div className="mt-3 p-4 bg-cream-50 rounded-xl border border-cream-200 space-y-3">
                      <p className="text-xs font-medium text-charcoal mb-2">Buy add-on credit packs:</p>
                      {addonPacks.map((pack) => (
                        <div key={pack.name} className="flex items-center justify-between">
                          <span className="text-sm text-charcoal">{pack.credits} credits ({pack.applications} apps)</span>
                          <button
                            onClick={() => handleBuyAddon(pack.name.split(' ')[0].toLowerCase())}
                            disabled={loadingAddon === pack.name.split(' ')[0].toLowerCase()}
                            className="px-3 py-1.5 bg-navy-600 text-white text-xs font-semibold rounded-lg hover:bg-navy-700 transition-colors cursor-pointer disabled:opacity-60"
                          >
                            {loadingAddon === pack.name.split(' ')[0].toLowerCase() ? <Loader2 className="w-3 h-3 animate-spin" /> : `$${pack.price}`}
                          </button>
                        </div>
                      ))}
                      <p className="text-xs text-warm-gray pt-1">Credits roll over while subscription is active.</p>
                    </div>
                  )}
                </div>
                <ul className="space-y-3 mb-5">
                  {[
                    { text: '100 complete applications/month', bold: true },
                    { text: 'Everything in Plus, plus:' },
                    { text: 'Chrome Extension: auto-fill ATS forms', bold: true, comingSoon: true },
                    { text: 'AI Screening Question Answers', bold: true },
                    { text: 'Premium dedicated support' },
                    { text: 'Powered by Claude Sonnet 4.6' },
                  ].map((f: { text: string; bold?: boolean; comingSoon?: boolean }, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>
                        {f.text}
                        {f.comingSoon && (
                          <span className="ml-1.5 inline-flex items-center bg-navy-600/10 text-navy-600 text-[10px] font-medium px-2 py-0.5 rounded-full">Coming Soon</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-navy-600">
                  <Clock className="w-5 h-5 flex-shrink-0 text-gold-400" />
                  <span className="text-sm font-semibold text-white">Cancel anytime. No contracts.</span>
                </div>
                <div className="mt-auto pt-6">
                  <button
                    onClick={() => handleSubscribe('max')}
                    disabled={loadingPlan === 'max'}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all cursor-pointer disabled:opacity-60 bg-navy-600 text-white hover:bg-navy-700 shadow-md"
                  >
                    {loadingPlan === 'max' ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Get Max <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Interactive Time Savings Calculator — Warm premium design */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-200/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold-100/40 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        <div className="max-w-4xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Time Savings</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-3">
              How Much Time Will You Save?
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
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Credit System</p>
            <h2 className="text-3xl font-bold text-navy-600 mb-3">
              How Credits Work
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
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl font-bold text-navy-600">
              Frequently Asked Questions
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
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gold-400/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gold-400/5 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="absolute inset-0 dot-grid opacity-[0.04]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" />
        <ScrollReveal>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Job Search?
          </h2>
          <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
            Start with 2 free applications. No credit card required. See why job seekers are switching to KarKo AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg hover:shadow-xl text-lg cta-glow"
            >
              Try It Free
            </Link>
            <Link
              href="/"
              className="px-10 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-300 text-lg border border-white/20 hover:border-white/40"
            >
              Learn More
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
