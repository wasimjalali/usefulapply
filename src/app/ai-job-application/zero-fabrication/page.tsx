import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';

const SITE_URL = 'https://www.karkoai.com';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Zero-Fabrication AI Applications',
    description:
      "KarKo AI's anti-hallucination system verifies every CV claim against your source documents. No fabricated skills, metrics, or roles.",
    openGraph: {
      title: 'Zero-Fabrication AI Applications | KarKo AI',
      description:
        'Every CV claim verified against your source documents. No fabricated skills, metrics, or roles.',
      url: '/ai-job-application/zero-fabrication',
      siteName: 'KarKo AI',
      type: 'website',
      locale: 'en_US',
    },
    alternates: {
      canonical: '/ai-job-application/zero-fabrication',
    },
  };
}

const faqs = [
  {
    q: "Which AI job application tool doesn't fabricate experience?",
    a: "Karko AI's anti-hallucination system prevents fabricated experience by extracting a verified list of skills and metrics from your uploaded CV before generation and enforcing these as hard constraints. No skill, metric, or achievement can appear in the output unless it exists in your source documents.",
  },
  {
    q: 'Can AI guarantee zero invented experience in job applications?',
    a: 'No AI can provide an absolute guarantee, because generative models produce statistical outputs. What Karko AI does is enforce structural constraints (a verified skills list and verified metrics list extracted from your CV) that make fabrication structurally difficult rather than just discouraged by prompt instructions.',
  },
  {
    q: 'What should I review in an AI-generated application?',
    a: 'Date accuracy, job title consistency, and emphasis decisions. Zero-fabrication protects against invented content, but the final judgment on how your experience is framed belongs to you. Plan 2–5 minutes of review per application before sending.',
  },
  {
    q: 'How does the verified metrics system work?',
    a: "During Phase 1 (before any documents are generated), Karko AI extracts all numbers from your uploaded CV: revenue figures, team sizes, percentages, timeframes. These become a binding list. In Phase 2, the CV agent can only use numbers from this list. If a number does not exist in your source documents, it does not appear in the output, not even as an approximation.",
  },
  {
    q: 'Is fabricated AI experience detectable by recruiters?',
    a: 'Increasingly yes. Background checks, reference calls, technical assessments, and interview deep-dives are standard ways fabricated content is exposed. The risk increases at senior roles where experience claims are more heavily scrutinized.',
  },
];

export default function ZeroFabricationPage() {
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
        name: 'Zero-Fabrication',
        item: `${SITE_URL}/ai-job-application/zero-fabrication`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Zero-Fabrication AI Job Application: No Invented Experience',
    description:
      "Karko AI's anti-hallucination system ensures every CV claim is verified against your source documents. No fabricated skills, metrics, or roles, ever.",
    author: { '@type': 'Organization', name: 'KarKo AI', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'KarKo AI',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/karko-ai.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/zero-fabrication`,
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
            <li className="text-navy-600 font-medium">Zero-Fabrication</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">Zero Fabrication</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                Zero-Fabrication AI Job Application: No Invented Experience
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
              Zero-fabrication means the AI can only generate claims that exist in your uploaded CV.
              Karko AI enforces this structurally: before generating any document, the system
              extracts a verified list of skills and metrics from your source files, and every output
              is checked against that list. If a skill or achievement isn&apos;t in your CV, it
              doesn&apos;t appear in the application.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: What Zero-Fabrication Actually Means */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Definition</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What Zero-Fabrication Actually Means (and What It Doesn&apos;t)
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Zero-fabrication is not a promise that AI output is always perfect. Generative models
              can still make formatting errors or emphasis mistakes. What it means specifically: the
              AI cannot invent new job titles, new employers, new time periods, new skills, or new
              metrics that don&apos;t exist in your source documents.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              &quot;Zero fabrication&quot; = zero new facts about you. The AI can reformulate,
              reorder, and emphasize, but it cannot create substance that doesn&apos;t already
              exist in your CV.
            </p>
          </div>
        </section>

        {/* H2: Why This Matters */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Why It Matters</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Why This Matters: What Happens When AI Fabricates
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Fabricated experience creates a credibility problem the moment the application
              succeeds. An interview question about a project you didn&apos;t do, a background check
              that doesn&apos;t match, or a technical assessment for a skill the AI invented. These
              are the downstream consequences of fabricated applications.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The short-term gain (sounding more qualified) creates long-term risk (a failed
              interview or rescinded offer). Zero-fabrication eliminates this risk category entirely.
            </p>
          </div>
        </section>

        {/* H2: How Karko AI's Anti-Hallucination System Works */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The System</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                How Karko AI&apos;s Anti-Hallucination System Works
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Phase 1 of every workflow extracts two verified lists from your uploaded CV: verified
              skills and verified metrics (actual numbers from your source documents). These lists
              become binding constraints in Phase 2.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The CV generation agent is explicitly forbidden from writing any skill not in the
              verified skills list, and any number not in the verified metrics list. A bullet point
              without a metric is always generated in preference to a bullet point with a fabricated
              number.
            </p>
          </div>
        </section>

        {/* H2: What You Still Need to Review */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Your Review</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What You Still Need to Review
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Zero-fabrication protects against invented content, but review is still necessary for:
              date accuracy (were dates transferred correctly from your CV?), role title consistency
              (does the tailored CV use your exact job titles?), and emphasis decisions (does the
              AI&apos;s prioritization of your experience reflect how you want to present yourself?).
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              AI handles speed and structure; you handle final judgment.
            </p>
          </div>
        </section>

        {/* H2: Zero-Fabrication in Different Markets */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Global Context</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Zero-Fabrication in Different Markets
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              In Germany and the EU, false claims in job applications can have legal consequences. In
              the US and UK, background checks are standard for professional roles.
              Zero-fabrication is therefore not just an ethical principle but a practical risk
              management approach regardless of which market you&apos;re applying in.
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
              href="/ai-job-application/ats-optimization"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              How ATS Optimization Works <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/master-cv-template"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              Build a Complete Master CV <ArrowRight className="w-4 h-4" />
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
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Generate Your Verified Application
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                Every claim traced back to your CV. No fabricated skills, metrics, or experience.
              </p>
              <a
                href="https://www.karkoai.com"
                className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
              >
                Generate Your Verified Application
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
