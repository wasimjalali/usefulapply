'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X, Sparkles, Zap, Crown, ArrowRight, HelpCircle } from 'lucide-react';

// Pricing tiers data
const tiers = [
  {
    name: 'Starter',
    tier: 'starter',
    price: 0,
    priceLabel: 'Free',
    priceSubtext: 'forever',
    credits: 50,
    applications: '~5',
    description: 'Perfect for trying out KarKo AI',
    icon: Sparkles,
    popular: false,
    bestValue: false,
    features: [
      { name: 'All CV templates (US & EU)', included: true },
      { name: 'Web search & company research', included: true },
      { name: 'AI refinement (max 2 iterations)', included: true },
      { name: 'Personalized CV, cover letter & email', included: true },
      { name: 'PDF export', included: true },
      { name: 'Application history (30 days)', included: true },
      { name: 'Add-on credits', included: false },
      { name: 'Credit rollover', included: false },
      { name: 'Priority support', included: false },
    ],
    cta: 'Start Free',
    ctaVariant: 'outline' as const,
  },
  {
    name: 'Plus',
    tier: 'plus',
    price: 19.99,
    priceLabel: '$19.99',
    priceSubtext: '/month',
    credits: 200,
    applications: '~20',
    description: 'For active job seekers',
    icon: Zap,
    popular: true,
    bestValue: false,
    features: [
      { name: 'All CV templates (US & EU)', included: true },
      { name: 'Web search & company research', included: true },
      { name: 'AI refinement (max 2 iterations)', included: true },
      { name: 'Personalized CV, cover letter & email', included: true },
      { name: 'PDF export', included: true },
      { name: 'Application history (unlimited)', included: true },
      { name: 'Add-on credits', included: true },
      { name: 'Credit rollover (1 month)', included: true },
      { name: 'Priority email support', included: true },
    ],
    cta: 'Get Plus',
    ctaVariant: 'primary' as const,
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: 39.99,
    priceLabel: '$39.99',
    priceSubtext: '/month',
    credits: 400,
    applications: '~40',
    description: 'For power users and professionals',
    icon: Crown,
    popular: false,
    bestValue: true,
    features: [
      { name: 'All CV templates (US & EU)', included: true },
      { name: 'Web search & company research', included: true },
      { name: 'AI refinement (max 2 iterations)', included: true },
      { name: 'Personalized CV, cover letter & email', included: true },
      { name: 'PDF export', included: true },
      { name: 'Application history (unlimited)', included: true },
      { name: 'Add-on credits', included: true },
      { name: 'Credit rollover (2 months)', included: true },
      { name: 'Premium support (24h response)', included: true },
    ],
    cta: 'Get Pro',
    ctaVariant: 'secondary' as const,
  },
];

// Add-on credit packs
const addonPacks = [
  { name: 'Small Pack', credits: 100, price: 7.99, discount: null },
  { name: 'Medium Pack', credits: 250, price: 17.99, discount: '10% off' },
  { name: 'Large Pack', credits: 500, price: 29.99, discount: '25% off' },
];

// FAQ items
const faqs = [
  {
    question: 'What happens if I run out of credits?',
    answer: 'You can upgrade your plan or purchase add-on credits (Plus & Pro only). Free tier credits reset monthly.',
  },
  {
    question: 'Do unused credits expire?',
    answer: 'Plus: 1 month rollover (max 400 credits). Pro: 2 months rollover (max 800 credits). Add-on credits never expire.',
  },
  {
    question: 'Can I change my plan anytime?',
    answer: 'Yes! You can upgrade anytime and get immediate access to more credits. Downgrades take effect at the end of your billing cycle.',
  },
  {
    question: "What's included in each application?",
    answer: 'Each application includes: AI-optimized CV tailored to the job, personalized cover letter, and professional email - all generated in under 3 minutes.',
  },
  {
    question: 'How does the AI personalization work?',
    answer: 'Our 3 AI agents research the company, analyze the job description, compare it with your CV, and generate hyper-personalized documents that highlight your most relevant experience.',
  },
  {
    question: 'Are all features available in all tiers?',
    answer: 'Yes! All tiers include web search, AI refinement, all templates, and PDF export. The only difference is the number of credits you receive.',
  },
];

export default function PricingPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Header */}
      <header className="bg-white border-b border-cream-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <img src="/karko-ai.png" alt="KarKo AI" className="h-8 w-auto" />
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/auth/login"
                className="text-sm font-medium text-charcoal hover:text-navy-600 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/auth/signup"
                className="px-4 py-2 text-sm font-medium bg-gold-400 text-white rounded-lg hover:bg-gold-500 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-navy-600 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto">
            All features included in every plan. Pay only for what you use.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              return (
                <div
                  key={tier.tier}
                  className={`relative bg-white rounded-2xl border-2 ${
                    tier.popular
                      ? 'border-gold-400 shadow-xl'
                      : tier.bestValue
                        ? 'border-sage-500 shadow-lg'
                        : 'border-cream-200 shadow-md'
                  } overflow-hidden`}
                >
                  {/* Badge */}
                  {tier.popular && (
                    <div className="absolute top-0 right-0 bg-gold-400 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                      MOST POPULAR
                    </div>
                  )}
                  {tier.bestValue && (
                    <div className="absolute top-0 right-0 bg-sage-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                      BEST VALUE
                    </div>
                  )}

                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`p-2 rounded-lg ${
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
                    </div>

                    {/* Credits */}
                    <div className="bg-cream-50 rounded-xl p-4 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-warm-gray">Monthly Credits</span>
                        <span className="text-lg font-bold text-charcoal">{tier.credits}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-warm-gray">Applications</span>
                        <span className="text-lg font-bold text-charcoal">{tier.applications}</span>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-6">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          {feature.included ? (
                            <Check className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-5 h-5 text-warm-gray flex-shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`text-sm ${
                              feature.included ? 'text-charcoal' : 'text-warm-gray'
                            }`}
                          >
                            {feature.name}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button */}
                    <Link
                      href={tier.price === 0 ? '/auth/signup' : `/auth/signup?plan=${tier.tier}`}
                      className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                        tier.ctaVariant === 'primary'
                          ? 'bg-gold-400 text-white hover:bg-gold-500 shadow-md'
                          : tier.ctaVariant === 'secondary'
                            ? 'bg-navy-600 text-white hover:bg-navy-700 shadow-md'
                            : 'border-2 border-navy-600 text-navy-600 hover:bg-navy-50'
                      }`}
                    >
                      {tier.cta}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Credit Usage Info */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-navy-600 text-center mb-8">
            How Credits Work
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-cream-50 rounded-xl">
              <div className="text-3xl font-bold text-gold-500 mb-2">10</div>
              <div className="text-sm font-medium text-charcoal mb-1">credits</div>
              <div className="text-sm text-warm-gray">Full Application</div>
              <div className="text-xs text-warm-gray mt-2">CV + Cover Letter + Email</div>
            </div>
            <div className="text-center p-6 bg-cream-50 rounded-xl">
              <div className="text-3xl font-bold text-gold-500 mb-2">2</div>
              <div className="text-sm font-medium text-charcoal mb-1">credits</div>
              <div className="text-sm text-warm-gray">Cover Letter Regen</div>
              <div className="text-xs text-warm-gray mt-2">Regenerate cover letter only</div>
            </div>
            <div className="text-center p-6 bg-cream-50 rounded-xl">
              <div className="text-3xl font-bold text-gold-500 mb-2">1</div>
              <div className="text-sm font-medium text-charcoal mb-1">credit</div>
              <div className="text-sm text-warm-gray">Email Regen</div>
              <div className="text-xs text-warm-gray mt-2">Regenerate email only</div>
            </div>
          </div>
        </div>
      </section>

      {/* Add-on Credits Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-navy-600 mb-2">Need More Credits?</h2>
            <p className="text-warm-gray">
              Plus & Pro subscribers can purchase add-on credit packs anytime
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {addonPacks.map((pack) => (
              <div
                key={pack.name}
                className="bg-white rounded-xl border border-cream-200 p-6 text-center hover:border-gold-300 hover:shadow-md transition-all"
              >
                {pack.discount && (
                  <div className="inline-block bg-sage-100 text-sage-600 text-xs font-medium px-2 py-1 rounded-full mb-3">
                    {pack.discount}
                  </div>
                )}
                <div className="text-2xl font-bold text-charcoal mb-1">{pack.credits}</div>
                <div className="text-sm text-warm-gray mb-3">credits</div>
                <div className="text-xl font-bold text-navy-600">${pack.price}</div>
                <div className="text-xs text-warm-gray mt-1">one-time purchase</div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-warm-gray mt-6">
            Add-on credits never expire and are used after your monthly credits are depleted.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-navy-600 text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-cream-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-cream-50 transition-colors"
                >
                  <span className="font-medium text-charcoal pr-4">{faq.question}</span>
                  <HelpCircle
                    className={`w-5 h-5 text-warm-gray flex-shrink-0 transition-transform ${
                      expandedFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedFaq === idx && (
                  <div className="px-4 pb-4">
                    <p className="text-warm-gray text-sm">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-gold-400 to-gold-500">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-navy-600 mb-4">
            Ready to Transform Your Job Search?
          </h2>
          <p className="text-navy-700 mb-8 max-w-2xl mx-auto">
            Start with 5 free applications and see how KarKo AI can save you hours on every job application.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="px-8 py-3 bg-navy-600 text-white font-medium rounded-xl hover:bg-navy-700 transition-colors shadow-lg"
            >
              Get Started Free
            </Link>
            <Link
              href="/"
              className="px-8 py-3 bg-white text-navy-600 font-medium rounded-xl hover:bg-cream-50 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy-600 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/karko-ai.png" alt="KarKo AI" className="h-8 w-auto brightness-0 invert" />
            </div>
            <div className="flex items-center gap-6 text-sm text-navy-100">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
              <Link href="/contact" className="hover:text-white transition-colors">
                Contact
              </Link>
            </div>
            <div className="text-sm text-navy-200">
              © 2026 KarKo AI. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
