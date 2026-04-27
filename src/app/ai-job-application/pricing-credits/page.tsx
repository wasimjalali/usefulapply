import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';

const SITE_URL = 'https://www.karkoai.com';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'AI Application Pricing & Credits',
    description:
      'KarKo AI pricing: Free (2 apps/month), Plus $19.99/month (25 apps), Max $79.99/month (100 apps). Transparent credit-based pricing.',
    canonical: '/ai-job-application/pricing-credits',
  });
}

const faqs = [
  {
    q: 'How much does Karko AI cost?',
    a: 'Free: 2 applications/month at no cost. Plus: $19.99/month for 25 applications. Max: $79.99/month for 100 applications. All plans include the complete 4-document package (tailored CV, cover letter, application email, follow-up email).',
  },
  {
    q: 'How many applications does 2 credits cover?',
    a: 'One complete application package. Each package generates a tailored CV, cover letter, application email, and follow-up email from a single job description. 2 credits = 1 complete package regardless of which flow you use (Analyze First or Apply Directly).',
  },
  {
    q: 'Is there a free plan with no credit card?',
    a: 'Yes. The Free plan gives 2 complete applications per month with no credit card required. The same AI quality as paid plans.',
  },
  {
    q: 'What happens if I run out of credits mid-month?',
    a: 'You can purchase additional credit packs without upgrading your monthly plan. Credit packs let you cover volume spikes without committing to a higher recurring price.',
  },
  {
    q: 'What is the cheapest plan for heavy job searching?',
    a: 'The Max plan at $79.99/month gives 100 applications, which works out to approximately $0.80 per complete application package. For context: replacing 100 manual applications (at 45 minutes each) with Karko AI saves roughly 75 hours of work per month.',
  },
];

export default function PricingCreditsPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'AI Job Application',
        item: `${SITE_URL}/ai-job-application`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Pricing & Credits',
        item: `${SITE_URL}/ai-job-application/pricing-credits`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'AI Job Application Pricing & Credits: How Karko AI Plans Work',
    description:
      'Karko AI pricing: Free (2 applications), Plus $19.99/month (25 applications), Max $79.99/month (100 applications). Credit-based system with transparent cost per application.',
    author: { '@type': 'Organization', name: 'KarKo AI', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'KarKo AI',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/karko-ai.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/pricing-credits`,
    datePublished: '2026-02-24',
    dateModified: '2026-03-29',
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <main>
        {/* Breadcrumb */}
        <nav className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-2">
          <ol className="flex items-center gap-2 text-sm text-warm-gray">
            <li>
              <Link href="/" className="hover:text-navy-600 transition-colors">
                Home
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/ai-job-application" className="hover:text-navy-600 transition-colors">
                AI Job Application
              </Link>
            </li>
            <li>/</li>
            <li className="text-navy-600 font-medium">Pricing &amp; Credits</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">Pricing & Credits</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                AI Job Application Pricing &amp; Credits
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                Karko AI uses a credit-based pricing model: each complete application package costs 2
                credits. The Free plan gives 4 credits (2 applications) free. The Plus plan
                ($19.99/month) gives 50 credits (25 applications). The Max plan ($79.99/month) gives
                200 credits (100 applications). All tiers generate the same four documents with no
                quality difference between plans.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
                >
                  Start Free - 2 Applications Included
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: The Three Plans Explained */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Plans</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                The Three Plans Explained
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
              Free: 4 credits, 2 complete applications per month, no credit card required. Good for
              evaluating output quality before committing. Plus ($19.99/month): 50
              credits, 25 complete applications per month. Good for active job searchers applying to
              5 to 10 roles per week.
            </p>
            <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
              Max ($79.99/month): 200 credits, 100 applications per month. Good for high-volume
              campaigns or career transitions with many active applications. All plans include the
              full document package, fit score, and anti-hallucination safeguards.
            </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: How Credits Are Counted */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Credit System</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                How Credits Are Counted
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              One complete application (Analyze First or Apply Directly) costs 2 credits. A fit
              assessment only (without generating documents) costs 0.5 credits. Regenerating a cover
              letter or email costs 0.5 credits per regeneration. The follow-up email is included in
              the initial 2-credit generation at no additional credit cost.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Add-on credit packs are available if you exceed your monthly plan volume.
            </p>
          </div>
        </section>

        {/* H2: Cost Per Application */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Cost Breakdown</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Cost Per Application: The Right Way to Compare
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              The fair comparison metric is cost per complete application package, not cost per
              month. Plus plan: $19.99 ÷ 25 applications = ~$0.80 per complete application package
              (CV + cover letter + 2 emails). Max plan: $79.99 ÷ 100 applications = ~$0.80 per
              application package.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Compare this to the time cost of manual applications: at 45 to 60 minutes each, 25
              applications is 18 to 25 hours of manual work.
            </p>
          </div>
        </section>

        {/* H2: When to Choose Each Plan */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Choosing a Plan</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                When to Choose Each Plan
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Start with the Free plan to validate output quality. Move to Plus if you are
              applying consistently and need more than 2 applications per month. Move to Max if you are in
              an intensive job search phase: layoff, career transition, or high-volume market.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Use credit packs to cover occasional spikes without upgrading your plan permanently.
            </p>
          </div>
        </section>

        {/* H2: What the Credit System Prevents */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Transparency</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What the Credit System Prevents
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Transparent credit counting makes cost predictable. Unlike tools that charge per
              &quot;AI interaction&quot; or have opaque token-based billing, Karko AI charges per
              complete application package. One job description generates one complete set of four
              documents for 2 credits.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              You always know exactly what you&apos;re paying for.
            </p>
          </div>
        </section>

        {/* Internal Links */}
        <section className="py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-4">
            <Link
              href="/ai-job-application"
              className="inline-flex items-center gap-2 text-sm font-semibold text-navy-600 hover:text-gold-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> AI Job Application Hub
            </Link>
            <Link
              href="/ai-job-application/free-no-signup-test"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              Free No-Signup Test <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/ai-job-application/90-second-application-package"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              What the Package Includes <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <div className="text-center mb-10">
                <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">FAQ</p>
                <h2 className="text-3xl md:text-4xl font-bold text-navy-600">
                  Frequently Asked Questions
                </h2>
              </div>
            </ScrollReveal>
            <div className="space-y-6">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  itemScope
                  itemType="https://schema.org/Question"
                  className="bg-white rounded-xl border border-cream-200 p-6"
                >
                  <h3 itemProp="name" className="text-lg font-bold text-charcoal mb-3">
                    {faq.q}
                  </h3>
                  <div
                    itemScope
                    itemType="https://schema.org/Answer"
                    itemProp="acceptedAnswer"
                  >
                    <p itemProp="text" className="text-warm-gray leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gold-400/10 rounded-full -translate-y-1/2 translate-x-1/2 animate-float-slow" />
          <ScrollReveal>
            <div className="max-w-4xl mx-auto text-center relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Get Started Free</h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                2 complete applications at no cost. No credit card required. Same AI quality as paid
                plans.
              </p>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </ScrollReveal>
        </section>
      </main>

      <Footer />
    </div>
  );
}
