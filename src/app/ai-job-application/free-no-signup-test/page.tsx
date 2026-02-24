import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';

const SITE_URL = 'https://www.karkoai.com';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Try AI Job Application Free, No Sign-Up Required | Karko AI',
    description:
      "Test Karko AI's job application generator without signing up. Free tier includes 20 applications. See the output quality before committing to any plan.",
    openGraph: {
      title: 'Try AI Job Application Free, No Sign-Up Required | Karko AI',
      description:
        "Test Karko AI's job application generator without signing up. Free tier includes 20 applications. See the output quality before committing to any plan.",
      url: `${SITE_URL}/ai-job-application/free-no-signup-test`,
      siteName: 'Karko AI',
      type: 'website',
    },
    alternates: {
      canonical: `${SITE_URL}/ai-job-application/free-no-signup-test`,
      languages: {
        en: `${SITE_URL}/ai-job-application/free-no-signup-test`,
        de: `${SITE_URL}/de/bewerbung-ki/ohne-anmeldung-kostenlos`,
      },
    },
  };
}

const faqs = [
  {
    q: 'Is there an AI job application tool I can try without signing up?',
    a: "Yes. Karko AI's free tier allows 20 complete applications (including tailored CV, cover letter, application email, and follow-up email) without creating an account or entering payment details.",
  },
  {
    q: 'Can I create job applications for free with AI?',
    a: "Yes. Karko AI's free tier gives 20 full applications at no cost. Each generates all four documents from a single job description. Paid plans (Plus at $29.99/month and Pro at $49.99/month) increase the monthly volume.",
  },
  {
    q: 'How many free applications do I get?',
    a: '20 complete applications on the free tier. Each application generates a tailored CV, cover letter, application email, and follow-up email from one job description.',
  },
  {
    q: "What's the difference between the free tier and paid plans?",
    a: 'Only volume. The free tier gives 20 applications per month. Plus gives 60 applications for $29.99/month. Pro gives 120 applications for $49.99/month. The AI quality, document types, and features are identical across all tiers.',
  },
  {
    q: 'Do I need to give my real CV to test the tool?',
    a: "No. For a first test, a summary of your skills and a couple of work history entries is enough to evaluate output quality. Once you're satisfied with the results, you can upload your complete CV for production use.",
  },
];

export default function FreeNoSignupTestPage() {
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
        name: 'Free No-Signup Test',
        item: `${SITE_URL}/ai-job-application/free-no-signup-test`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Test AI Job Application Free, No Sign-Up Required',
    description:
      "Test Karko AI's job application generator without signing up. Free tier includes 20 applications. See the output quality before committing to any plan.",
    author: { '@type': 'Organization', name: 'Karko AI', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Karko AI', url: SITE_URL },
    url: `${SITE_URL}/ai-job-application/free-no-signup-test`,
    datePublished: '2026-02-24',
    dateModified: '2026-02-24',
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
            <li className="text-navy-600 font-medium">Free No-Signup Test</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">Try Free</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                Test AI Job Application Free, No Sign-Up Required
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                You can generate job application documents with Karko AI without signing up. The free
                tier includes 20 applications with no credit card required. Paste a job description,
                see the fit score and generated package, and evaluate quality before deciding whether
                to create an account or upgrade.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: What "No Sign-Up" Actually Means */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">No Commitment</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What &quot;No Sign-Up&quot; Actually Means
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
              No sign-up means you can test the output quality without creating an account first.
              You paste a job description, upload your CV, and receive the complete package
              (tailored CV, cover letter, application email, follow-up email) to evaluate before
              committing any personal details or payment.
            </p>
            <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
              The free tier gives 20 full applications. An account becomes useful when you want to
              save your application history, reuse your Master CV across sessions, or generate more
              than 20 applications.
            </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: What the Free Tier Includes */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Free Plan</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What the Free Tier Includes
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
              20 complete applications, each generating all four documents (tailored CV, cover
              letter, application email, follow-up email). No expiry on the free tier. The fit score
              analysis is included in each application.
            </p>
            <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
              The same AI quality (Claude Sonnet 4.6 via Bedrock) as paid tiers. No difference in
              output quality between free and paid. Only the volume limit changes.
            </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: When to Create an Account */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Next Step</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                When to Create an Account
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Three questions determine the right moment: (1) Does the output match your
              expectations? If the tailored CV and cover letter feel right for your specific role, an
              account is worth it. (2) Do you need to save and revisit previous applications?
              Application history is account-specific.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              (3) Are you applying to multiple roles simultaneously and need more than 20
              applications? That&apos;s when the Plus or Pro plan makes sense. Don&apos;t create an
              account until question one has a &quot;yes.&quot; That&apos;s the only honest
              sequence.
            </p>
          </div>
        </section>

        {/* H2: Data Minimization for the Trial */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Privacy</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Data Minimization for the Trial
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              When testing without an account, use a job description plus a minimal skill summary
              rather than your full CV with personal details. You can evaluate output quality without
              uploading your home address, phone number, or internal project names.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Add complete details once you&apos;ve confirmed the quality suits your needs. This is
              especially relevant for users in Germany and the EU, where data minimization is a good
              baseline practice regardless of the tool.
            </p>
          </div>
        </section>

        {/* Internal Links */}
        <section className="py-8 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-4">
            <Link
              href="/ai-job-application"
              className="inline-flex items-center gap-2 text-sm font-semibold text-navy-600 hover:text-gold-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> AI Job Application Hub
            </Link>
            <Link
              href="/ai-job-application/pricing-credits"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              See Pricing &amp; Credits <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/master-cv-template"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              Build a Master CV first <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
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
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Try Free, No Sign-Up
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                20 complete applications at no cost. See the output quality before committing to
                anything.
              </p>
              <a
                href="https://www.karkoai.com"
                className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
              >
                Try Free, No Sign-Up
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
