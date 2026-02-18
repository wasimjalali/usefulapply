'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Sparkles, Zap, Crown, ArrowRight, ChevronDown, FileText, MessageSquare, BarChart3, Clock, Plus as PlusIcon, Loader2 } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { useAuth } from '@/contexts/AuthContext';

// Value-focused feature lines per tier (6 lines each — pure value, no implementation details)

// Pricing tiers data - Value-focused cards (6 lines each)
const tiers = [
  {
    name: 'Starter',
    tier: 'starter',
    price: 0,
    priceLabel: 'Free',
    priceSubtext: 'forever',
    credits: 10,
    applications: '5',
    description: 'See your first AI application',
    icon: Sparkles,
    popular: false,
    bestValue: false,
    features: [
      { text: '5 complete applications/month', bold: true },
      { text: 'Tailored CV, cover letter, email & follow-up' },
      { text: 'Fit score before you apply' },
      { text: 'US & EU professional templates' },
      { text: 'No watermark on any document' },
      { text: 'Claude Sonnet 4.6, specialized for job applications' },
    ],
    hoursSaved: '~4 hours saved/month',
    cta: 'Start Free',
    ctaVariant: 'outline' as const,
    hasAddons: false,
  },
  {
    name: 'Plus',
    tier: 'plus',
    price: 29.99,
    priceLabel: '$29.99',
    priceSubtext: '/month',
    credits: 120,
    applications: '60',
    description: 'For serious job seekers',
    icon: Zap,
    popular: true,
    bestValue: false,
    features: [
      { text: '60 complete applications/month', bold: true },
      { text: 'Tailored CV, cover letter, email & follow-up' },
      { text: 'Fit score before you apply' },
      { text: 'Unlimited application history' },
      { text: 'Add-on credit packs available' },
      { text: 'Claude Sonnet 4.6, specialized for job applications' },
    ],
    hoursSaved: '~45 hours saved/month',
    cta: 'Get Plus',
    ctaVariant: 'primary' as const,
    hasAddons: true,
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: 49.99,
    priceLabel: '$49.99',
    priceSubtext: '/month',
    credits: 240,
    applications: '120',
    description: 'For high-volume applicants',
    icon: Crown,
    popular: false,
    bestValue: true,
    features: [
      { text: '120 complete applications/month', bold: true },
      { text: 'Tailored CV, cover letter, email & follow-up' },
      { text: 'Fit score before you apply' },
      { text: 'Unlimited history + credit rollover (2 months)' },
      { text: 'Add-on credit packs available' },
      { text: 'Claude Sonnet 4.6, specialized for job applications' },
    ],
    hoursSaved: '~90 hours saved/month',
    cta: 'Get Pro',
    ctaVariant: 'secondary' as const,
    hasAddons: true,
  },
];

// Add-on credit packs (2 options — both above free tier's 10 credits)
// TODO: Replace priceId values with actual Stripe Price IDs
const addonPacks = [
  { name: 'Medium Pack', credits: 60, applications: 40, price: 14.99, perCredit: '$0.25', priceId: 'price_addon_medium' },
  { name: 'Large Pack', credits: 120, applications: 80, price: 29.99, perCredit: '$0.25', priceId: 'price_addon_large' },
];

// Time savings data for interactive calculator
const savingsTiers = [
  {
    plan: 'Starter',
    apps: 5,
    hoursSaved: 4,
    price: 'Free',
    tagline: 'That is 4 hours you get back for free. No credit card required.',
  },
  {
    plan: 'Plus',
    apps: 60,
    hoursSaved: 45,
    price: '$29.99/mo',
    tagline: 'That is over a full work week saved every month. At just $0.50 per application.',
  },
  {
    plan: 'Pro',
    apps: 120,
    hoursSaved: 90,
    price: '$49.99/mo',
    tagline: 'That is over two full work weeks saved. At just $0.42 per application.',
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
    answer: 'Plus and Pro subscribers can purchase add-on credit packs anytime. Free tier credits reset monthly. You can also upgrade your plan for immediate access to more credits.',
  },
  {
    question: 'Do unused credits expire?',
    answer: 'Plus: credits roll over for 1 month (max 120 credits). Pro: credits roll over for 2 months (max 480 credits). Add-on credits never expire.',
  },
  {
    question: 'Can I change or cancel my plan?',
    answer: 'Absolutely. Upgrade anytime for immediate access to more credits. Downgrade or cancel at the end of your billing cycle. No hidden fees, no lock-in contracts.',
  },
  {
    question: 'How is KarKo different from other resume builders?',
    answer: 'Most tools just help you format a resume. KarKo AI is an agentic system that analyzes the job description, extracts company insights, runs a fit analysis, generates a tailored CV, writes a personalized cover letter, and drafts a professional email, all automatically in one workflow. The entire process takes under 90 seconds.',
  },
  {
    question: 'What AI model does KarKo use?',
    answer: 'KarKo AI runs on Claude Sonnet 4.6 by Anthropic, one of the most capable AI models available for writing and agentic tasks. Unlike competitors who use cheaper open-source models, we use the same US-based, frontier-grade AI trusted by leading enterprises. On top of that, we have built a specialized system and agentic workflow designed specifically for job applications, so the model is not just powerful, it is precisely tuned to produce professional, ATS-optimized, role-specific documents.',
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

      {/* Hero Section */}
      <section className="pt-16 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <ScrollReveal delay={0} direction="down" distance={20}>
          <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Pricing</p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <h1 className="text-4xl sm:text-5xl font-bold text-navy-600 mb-4 leading-tight">
            Simple, Transparent{' '}
            <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">Pricing</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto">
            Every plan includes all features. The only difference is your volume.
          </p>
          </ScrollReveal>
          <ScrollReveal delay={450}>
          <div className="mt-6 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-navy-600 shadow-md">
            <img src="/anthropic-logo.svg" alt="Anthropic" className="w-5 h-5 invert opacity-90" />
            <span className="text-white text-sm font-semibold">Claude Sonnet 4.6 by Anthropic</span>
            <span className="w-px h-4 bg-navy-400" />
            <span className="text-navy-200 text-sm">Specialized for job applications · All plans</span>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 pt-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier, tierIdx) => {
              const Icon = tier.icon;
              return (
                <ScrollReveal key={tier.tier} delay={tierIdx * 150}>
                <div
                  className={`relative bg-white rounded-2xl border-2 ${
                    tier.popular
                      ? 'border-gold-400 shadow-xl scale-[1.02]'
                      : tier.bestValue
                        ? 'border-navy-400 shadow-lg'
                        : 'border-cream-200 shadow-md'
                  } overflow-hidden transition-all card-hover-lift`}
                >
                  {/* Badge */}
                  {tier.popular && (
                    <div className="bg-gradient-to-r from-gold-400 to-gold-500 text-white text-xs font-bold px-4 py-2 text-center">
                      MOST POPULAR
                    </div>
                  )}
                  {tier.bestValue && (
                    <div className="bg-navy-600 text-white text-xs font-bold px-4 py-2 text-center">
                      BEST VALUE PER APPLICATION
                    </div>
                  )}

                  <div className="p-8 flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-5">
                      <div
                        className={`p-2.5 rounded-xl ${
                          tier.popular
                            ? 'bg-gold-100'
                            : tier.bestValue
                              ? 'bg-navy-100'
                              : 'bg-cream-100'
                        }`}
                      >
                        <Icon
                          className={`w-6 h-6 ${
                            tier.popular
                              ? 'text-gold-500'
                              : tier.bestValue
                                ? 'text-navy-600'
                                : 'text-navy-600'
                          }`}
                        />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-charcoal">{tier.name}</h3>
                        <p className="text-sm text-warm-gray">{tier.description}</p>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-navy-600">{tier.priceLabel}</span>
                        <span className="text-warm-gray">{tier.priceSubtext}</span>
                      </div>
                      {tier.price > 0 && (
                        <p className="text-xs text-warm-gray mt-1">
                          ~${(tier.price / parseInt(tier.applications)).toFixed(2)} per application
                        </p>
                      )}
                      <div className="mt-2">
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                          tier.popular
                            ? 'bg-gold-50 text-gold-600 border border-gold-200'
                            : tier.bestValue
                              ? 'bg-navy-50 text-navy-600 border border-navy-200'
                              : 'bg-cream-100 text-navy-500 border border-cream-300'
                        }`}>
                          {tier.credits} credits/month
                        </span>
                      </div>
                    </div>

                    {/* Collapsible Add-on Section (Plus & Pro only) — above features */}
                    {tier.hasAddons && (
                      <div className="mb-6">
                        <button
                          onClick={() => setExpandedAddon(expandedAddon === tier.tier ? null : tier.tier)}
                          className="w-full flex items-center justify-between p-3 rounded-xl border border-cream-200 hover:border-gold-300 hover:bg-cream-50 transition-all cursor-pointer"
                        >
                          <span className="text-sm font-medium text-charcoal flex items-center gap-2">
                            <PlusIcon className="w-4 h-4 text-gold-500" />
                            Need more credits?
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-warm-gray transition-transform duration-200 ${
                              expandedAddon === tier.tier ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedAddon === tier.tier && (
                          <div className="mt-3 p-4 bg-cream-50 rounded-xl border border-cream-200 space-y-3">
                            <p className="text-xs font-medium text-charcoal mb-2">Buy add-on credit packs:</p>
                            {addonPacks.map((pack) => (
                              <div key={pack.name} className="flex items-center justify-between">
                                <div>
                                  <span className="text-sm text-charcoal">{pack.credits} credits</span>
                                  <span className="text-xs text-warm-gray ml-2">{pack.perCredit}/credit</span>
                                </div>
                                <button
                                  onClick={() => handleBuyAddon(pack.name.split(' ')[0].toLowerCase())}
                                  disabled={loadingAddon === pack.name.split(' ')[0].toLowerCase()}
                                  className="px-3 py-1.5 bg-navy-600 text-white text-xs font-semibold rounded-lg hover:bg-navy-700 transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  {loadingAddon === pack.name.split(' ')[0].toLowerCase() ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    `$${pack.price}`
                                  )}
                                </button>
                              </div>
                            ))}
                            <p className="text-xs text-warm-gray pt-1">Credits never expire.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Value Features (5 lines) */}
                    <ul className="space-y-3 mb-5">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-sage-500" />
                          <span className={`text-sm text-charcoal ${feature.bold ? 'font-semibold' : ''}`}>
                            {feature.text}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Hours Saved — emotional anchor line */}
                    <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 ${
                      tier.bestValue
                        ? 'bg-navy-600'
                        : tier.popular
                          ? 'bg-gold-50 border border-gold-200'
                          : 'bg-cream-50 border border-cream-200'
                    }`}>
                      <Clock className={`w-5 h-5 flex-shrink-0 ${
                        tier.bestValue ? 'text-gold-400' : tier.popular ? 'text-gold-500' : 'text-navy-400'
                      }`} />
                      <span className={`text-sm font-semibold ${
                        tier.bestValue ? 'text-white' : tier.popular ? 'text-navy-600' : 'text-navy-600'
                      }`}>
                        {tier.hoursSaved}
                      </span>
                    </div>

                    {/* CTA Button — at bottom after features for natural conversion flow */}
                    <div className="mt-auto pt-6">
                      {tier.price === 0 ? (
                        <Link
                          href="/dashboard"
                          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all border-2 border-navy-200 text-navy-600 hover:bg-navy-50 hover:border-navy-400"
                        >
                          {tier.cta}
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleSubscribe(tier.tier)}
                          disabled={loadingPlan === tier.tier}
                          className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all cursor-pointer disabled:opacity-60 ${
                            tier.ctaVariant === 'primary'
                              ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-white hover:from-gold-500 hover:to-gold-600 shadow-md hover:shadow-lg'
                              : 'bg-navy-600 text-white hover:bg-navy-700 shadow-md'
                          }`}
                        >
                          {loadingPlan === tier.tier ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              {tier.cta}
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Interactive Time Savings Calculator — Warm premium design */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-200/30 rounded-full -translate-y-1/2 translate-x-1/2 animate-float-slow" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold-100/40 rounded-full translate-y-1/2 -translate-x-1/2 animate-float-delayed" />
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
            <ScrollReveal delay={0}>
            <div className="text-center p-8 bg-cream-50 rounded-2xl border border-cream-200 card-hover-lift">
              <div className="w-14 h-14 bg-navy-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-7 h-7 text-navy-600" />
              </div>
              <div className="text-3xl font-bold text-navy-600 mb-1">0.5</div>
              <div className="text-sm font-semibold text-charcoal mb-2">credits</div>
              <div className="text-sm font-medium text-charcoal">Fit Analysis</div>
              <div className="text-xs text-warm-gray mt-2">Job fit score + skill gaps</div>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={100}>
            <div className="text-center p-8 bg-cream-50 rounded-2xl border border-cream-200 card-hover-lift">
              <div className="w-14 h-14 bg-gold-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7 text-gold-500" />
              </div>
              <div className="text-3xl font-bold text-navy-600 mb-1">1.5</div>
              <div className="text-sm font-semibold text-charcoal mb-2">credits</div>
              <div className="text-sm font-medium text-charcoal">Full Application</div>
              <div className="text-xs text-warm-gray mt-2">CV + Cover Letter + Email</div>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={200}>
            <div className="text-center p-8 bg-cream-50 rounded-2xl border border-cream-200 card-hover-lift">
              <div className="w-14 h-14 bg-sage-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-7 h-7 text-sage-600" />
              </div>
              <div className="text-3xl font-bold text-navy-600 mb-1">0.5</div>
              <div className="text-sm font-semibold text-charcoal mb-2">credits</div>
              <div className="text-sm font-medium text-charcoal">Cover Letter Regen</div>
              <div className="text-xs text-warm-gray mt-2">Regenerate with new tone</div>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={300}>
            <div className="text-center p-8 bg-cream-50 rounded-2xl border border-cream-200 card-hover-lift">
              <div className="w-14 h-14 bg-sage-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-sage-600" />
              </div>
              <div className="text-3xl font-bold text-navy-600 mb-1">0.5</div>
              <div className="text-sm font-semibold text-charcoal mb-2">credits</div>
              <div className="text-sm font-medium text-charcoal">Email Regen</div>
              <div className="text-xs text-warm-gray mt-2">Regenerate application email</div>
            </div>
            </ScrollReveal>
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
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-400/10 rounded-full -translate-y-1/2 translate-x-1/2 animate-float-slow" />
        <ScrollReveal>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Job Search?
          </h2>
          <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
            Start with 5 free applications. No credit card required. See why job seekers are switching to KarKo AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
            >
              Try It Free
            </Link>
            <Link
              href="/"
              className="px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/30 hover:shadow-xl hover:scale-[1.02] hover:border-gold-400/50 transition-all duration-300 text-lg"
            >
              Learn More
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>

      <Footer />
    </div>
  );
}
