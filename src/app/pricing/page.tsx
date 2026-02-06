'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X, Sparkles, Zap, Crown, ArrowRight, ChevronDown, FileText, Search, Shield, MessageSquare, Globe, BarChart3, TrendingUp, Clock, Calculator, Loader2 } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { useAuth } from '@/contexts/AuthContext';

// Pricing tiers data - Updated pricing model
const tiers = [
  {
    name: 'Starter',
    tier: 'starter',
    price: 0,
    priceLabel: 'Free',
    priceSubtext: 'forever',
    credits: 6,
    applications: '3',
    description: 'Try KarKo AI risk-free',
    icon: Sparkles,
    popular: false,
    bestValue: false,
    features: [
      { name: 'Agentic AI application generation', included: true, highlight: true },
      { name: 'Personalized CV, cover letter & email', included: true, highlight: true },
      { name: 'Fit analysis (strong/good/weak)', included: true, highlight: false },
      { name: 'AI company analysis from job description', included: true, highlight: false },
      { name: 'All CV templates (US & EU)', included: true, highlight: false },
      { name: 'ATS-optimized formatting', included: true, highlight: false },
      { name: 'AI self-refinement iterations', included: true, highlight: false },
      { name: 'PDF export', included: true, highlight: false },
      { name: 'Application history (30 days)', included: true, highlight: false },
      { name: 'Add-on credit packs', included: false, highlight: false },
      { name: 'Credit rollover', included: false, highlight: false },
    ],
    cta: 'Start Free',
    ctaVariant: 'outline' as const,
  },
  {
    name: 'Plus',
    tier: 'plus',
    price: 29.99,
    priceLabel: '$29.99',
    priceSubtext: '/month',
    credits: 120,
    applications: '60',
    description: 'For active job seekers',
    icon: Zap,
    popular: true,
    bestValue: false,
    features: [
      { name: 'Agentic AI application generation', included: true, highlight: true },
      { name: 'Personalized CV, cover letter & email', included: true, highlight: true },
      { name: 'Fit analysis (strong/good/weak)', included: true, highlight: false },
      { name: 'AI company analysis from job description', included: true, highlight: false },
      { name: 'All CV templates (US & EU)', included: true, highlight: false },
      { name: 'ATS-optimized formatting', included: true, highlight: false },
      { name: 'AI self-refinement iterations', included: true, highlight: false },
      { name: 'PDF export', included: true, highlight: false },
      { name: 'Application history (unlimited)', included: true, highlight: false },
      { name: 'Add-on credit packs', included: true, highlight: false },
      { name: 'Credit rollover (1 month)', included: true, highlight: false },
    ],
    cta: 'Get Plus',
    ctaVariant: 'primary' as const,
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: 49.99,
    priceLabel: '$49.99',
    priceSubtext: '/month',
    credits: 240,
    applications: '120',
    description: 'For power users & professionals',
    icon: Crown,
    popular: false,
    bestValue: true,
    features: [
      { name: 'Agentic AI application generation', included: true, highlight: true },
      { name: 'Personalized CV, cover letter & email', included: true, highlight: true },
      { name: 'Fit analysis (strong/good/weak)', included: true, highlight: false },
      { name: 'AI company analysis from job description', included: true, highlight: false },
      { name: 'All CV templates (US & EU)', included: true, highlight: false },
      { name: 'ATS-optimized formatting', included: true, highlight: false },
      { name: 'AI self-refinement iterations', included: true, highlight: false },
      { name: 'PDF export', included: true, highlight: false },
      { name: 'Application history (unlimited)', included: true, highlight: false },
      { name: 'Add-on credit packs', included: true, highlight: false },
      { name: 'Credit rollover (2 months)', included: true, highlight: false },
    ],
    cta: 'Get Pro',
    ctaVariant: 'secondary' as const,
  },
];

// Add-on credit packs
// TODO: Replace priceId values with actual Stripe Price IDs
const addonPacks = [
  { name: 'Small Pack', credits: 30, applications: 15, price: 7.49, discount: null, priceId: 'price_addon_small' },
  { name: 'Medium Pack', credits: 60, applications: 30, price: 14.99, discount: 'Best Value', priceId: 'price_addon_medium' },
  { name: 'Large Pack', credits: 120, applications: 60, price: 29.99, discount: 'Most Popular', priceId: 'price_addon_large' },
];

// FAQ items
const faqs = [
  {
    question: 'What exactly do I get with each application?',
    answer: 'Each application generates a complete package: an AI-optimized CV tailored to the job description, a personalized cover letter with company research, and a professional application email, all in under 3 minutes.',
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
    answer: 'Most tools just help you format a resume. KarKo AI is an agentic system that analyzes the job description, extracts company insights, runs a fit analysis, generates a tailored CV, writes a personalized cover letter, and drafts a professional email, all automatically in one workflow.',
  },
];

export default function PricingPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingAddon, setLoadingAddon] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  const handleSubscribe = async (planTier: string) => {
    if (!user) {
      router.push(`/auth/signup?plan=${planTier}`);
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
            All Features. Every Plan.{' '}
            <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">Just Pick Your Volume.</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto">
            The full agentic AI workflow is included in every plan: company research, ATS optimization, personalized documents, and more. You only choose how many applications you need.
          </p>
          </ScrollReveal>
        </div>
      </section>

      {/* All Features Included Banner */}
      <section className="pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
          <div className="bg-navy-600 rounded-2xl p-6 md:p-8">
            <p className="text-center text-sm font-semibold text-gold-400 uppercase tracking-widest mb-5">Included in every plan</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { icon: Sparkles, label: 'Agentic AI' },
                { icon: Search, label: 'Company Analysis' },
                { icon: Shield, label: 'ATS Optimized' },
                { icon: Globe, label: 'US & EU Templates' },
                { icon: TrendingUp, label: 'Fit Analysis' },
                { icon: MessageSquare, label: 'AI Refinement' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex flex-col items-center gap-2 text-center">
                    <div className="w-10 h-10 bg-navy-500/50 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-gold-400" />
                    </div>
                    <span className="text-xs font-medium text-navy-200">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
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
                        ? 'border-sage-400 shadow-lg'
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
                    <div className="bg-sage-500 text-white text-xs font-bold px-4 py-2 text-center">
                      BEST VALUE PER APPLICATION
                    </div>
                  )}

                  <div className="p-8">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-5">
                      <div
                        className={`p-2.5 rounded-xl ${
                          tier.popular
                            ? 'bg-gold-100'
                            : tier.bestValue
                              ? 'bg-sage-100'
                              : 'bg-cream-100'
                        }`}
                      >
                        <Icon
                          className={`w-6 h-6 ${
                            tier.popular
                              ? 'text-gold-500'
                              : tier.bestValue
                                ? 'text-sage-500'
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
                    </div>

                    {/* Credits Box */}
                    <div className={`rounded-xl p-4 mb-6 ${
                      tier.popular ? 'bg-gold-50 border border-gold-200' : 'bg-cream-50 border border-cream-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-charcoal">Monthly Credits</span>
                        <span className="text-xl font-bold text-navy-600">{tier.credits}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-warm-gray">Full Applications</span>
                        <span className="text-lg font-bold text-charcoal">{tier.applications}</span>
                      </div>
                    </div>

                    {/* CTA Button */}
                    {tier.price === 0 ? (
                      <Link
                        href="/auth/signup"
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all mb-6 border-2 border-navy-200 text-navy-600 hover:bg-navy-50 hover:border-navy-400"
                      >
                        {tier.cta}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(tier.tier)}
                        disabled={loadingPlan === tier.tier}
                        className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all mb-6 cursor-pointer disabled:opacity-60 ${
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

                    {/* Features */}
                    <ul className="space-y-3">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          {feature.included ? (
                            <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${feature.highlight ? 'text-gold-500' : 'text-sage-500'}`} />
                          ) : (
                            <X className="w-5 h-5 text-cream-400 flex-shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`text-sm ${
                              feature.included
                                ? feature.highlight ? 'text-charcoal font-medium' : 'text-charcoal'
                                : 'text-warm-gray'
                            }`}
                          >
                            {feature.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
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

      {/* Add-on Credits Section */}
      <section id="addons" className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Add-ons</p>
            <h2 className="text-3xl font-bold text-navy-600 mb-3">Need More Credits?</h2>
            <p className="text-warm-gray">
              Plus and Pro subscribers can purchase add-on credit packs anytime. Credits never expire.
            </p>
          </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-3 gap-6">
            {addonPacks.map((pack, packIdx) => (
              <ScrollReveal key={pack.name} delay={packIdx * 150}>
              <div
                className="bg-white rounded-2xl border border-cream-200 p-8 text-center hover:border-gold-300 hover:shadow-lg transition-all card-hover-lift"
              >
                {pack.discount && (
                  <div className="inline-block bg-sage-100 text-sage-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
                    {pack.discount}
                  </div>
                )}
                <div className="text-3xl font-bold text-charcoal mb-1">{pack.credits}</div>
                <div className="text-sm text-warm-gray mb-1">credits</div>
                <div className="text-sm font-semibold text-sage-600 mb-4">{pack.applications} applications</div>
                <div className="text-2xl font-bold text-navy-600">${pack.price}</div>
                <div className="text-xs text-warm-gray mt-1">one-time purchase</div>
                <button
                  onClick={() => handleBuyAddon(pack.name.split(' ')[0].toLowerCase())}
                  disabled={loadingAddon === pack.name.split(' ')[0].toLowerCase()}
                  className="mt-4 w-full px-4 py-2.5 bg-navy-600 text-white text-sm font-semibold rounded-xl hover:bg-navy-700 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {loadingAddon === pack.name.split(' ')[0].toLowerCase() ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    `Buy ${pack.credits} Credits`
                  )}
                </button>
              </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
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
                className="bg-cream-50 border border-cream-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-cream-100 transition-colors cursor-pointer"
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

      {/* ROI Time Savings Calculator */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Time Savings</p>
            <h2 className="text-3xl font-bold text-navy-600 mb-3">
              How Much Time Will You Save?
            </h2>
            <p className="text-warm-gray max-w-xl mx-auto">
              Each application saves you approximately 45 minutes of manual work. Here is what that looks like per plan.
            </p>
          </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { plan: 'Starter', apps: 3, hours: '2.25', price: 'Free', color: 'cream' },
              { plan: 'Plus', apps: 60, hours: '45', price: '$29.99/mo', color: 'gold' },
              { plan: 'Pro', apps: 120, hours: '90', price: '$49.99/mo', color: 'navy' },
            ].map((tier, i) => (
              <ScrollReveal key={i} delay={i * 150}>
              <div className={`rounded-2xl p-8 text-center border card-hover-lift ${
                tier.color === 'gold' ? 'bg-white border-gold-300 shadow-lg' : 'bg-white border-cream-200'
              }`}>
                <h3 className="font-bold text-charcoal text-lg mb-1">{tier.plan}</h3>
                <p className="text-sm text-warm-gray mb-4">{tier.price}</p>
                <div className="w-16 h-16 bg-navy-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-8 h-8 text-navy-600" />
                </div>
                <div className="text-4xl font-bold text-navy-600 mb-1">{tier.hours}</div>
                <div className="text-sm font-medium text-charcoal mb-1">hours saved</div>
                <div className="text-xs text-warm-gray">per month ({tier.apps} apps × 45 min)</div>
              </div>
              </ScrollReveal>
            ))}
          </div>
          <p className="text-center text-sm text-warm-gray mt-8">
            Based on the average time of 45 minutes to manually research a company, tailor a CV, write a cover letter, and draft an application email.
          </p>
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
            Start with 3 free applications. No credit card required. See why job seekers save 45+ minutes per application with KarKo AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
            >
              Get Started Free
            </Link>
            <Link
              href="/"
              className="px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/20 transition-all text-lg"
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
