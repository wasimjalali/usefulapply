import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';

import { SEO_SITE_URL } from '@/lib/seo/site-url';

const SITE_URL = SEO_SITE_URL;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'ATS-Optimized AI Job Applications',
    description:
      'Useful Apply generates ATS-optimized CVs with keyword alignment, single-column formatting, and compatibility with Workday, Greenhouse, and Lever.',
    canonical: '/ai-job-application/ats-optimization',
  });
}

const faqs = [
  {
    q: 'What AI optimizes job applications for ATS systems?',
    a: "Useful Apply optimizes job applications for ATS by mapping job description keywords onto your CV and cover letter, generating ATS-safe single-column formatting, and producing output compatible with Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, and Taleo.",
  },
  {
    q: 'What formatting does an ATS-safe CV need?',
    a: 'Single-column layout, standard section headings (Work Experience, Education, Skills), no tables or text boxes for critical content, consistent date formats, and system fonts like Arial or Georgia. Useful Apply applies all of these by default across all CV templates.',
  },
  {
    q: 'How does AI match my CV to job description keywords?',
    a: "Useful Apply extracts the top required skills and keywords from the job description, then maps them against your verified CV content, using the job description's exact phrasing where your CV uses equivalent terms. No keywords are added for skills you don't actually have.",
  },
  {
    q: 'Which ATS platforms does Useful Apply work with?',
    a: 'Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, and Taleo. The generated documents are designed for clean upload parsing and stable copy-paste into ATS text fields in all of these systems.',
  },
  {
    q: 'What keyword overlap should I aim for?',
    a: "Industry guidance suggests 60 to 85% keyword overlap between the job description requirements and your CV as a target range for competitive ATS performance. Useful Apply's tailoring aims for this range based on your verified skills. It will not fabricate keywords to artificially inflate the score.",
  },
];

export default function ATSOptimizationPage() {
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
        name: 'ATS Optimization',
        item: `${SITE_URL}/ai-job-application/ats-optimization`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'ATS-Optimized Job Application with AI: Keywords, Format & Systems',
    description:
      'Learn how Useful Apply generates ATS-optimized CVs and cover letters. Keyword alignment, single-column formatting, and compatibility with Workday, Greenhouse, Lever, and more.',
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/ats-optimization`,
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
            <li className="text-navy-600 font-medium">ATS Optimization</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">ATS Optimization</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                ATS-Optimized Job Application with AI: Keywords, Format &amp; Systems
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                An AI tool optimizes job applications for ATS when it maps keywords and skills
                from the job description onto the CV and cover letter, produces ATS-safe structure
                and formatting, and prioritizes content by role relevance without creating
                contradictions with your work history. Useful Apply is designed specifically for this,
                generating documents that pass through ATS parsing before a human reviewer sees them.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
                >
                  Try ATS-Optimized Applications Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: What ATS Systems Actually Check */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">How ATS Works</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What ATS Systems Actually Check
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              ATS (Applicant Tracking Systems) don&apos;t evaluate quality. They evaluate
              parseability and relevance. Parseability: can the system extract work history, job
              titles, education, and skills from the document without the content getting lost in
              tables, text boxes, or multi-column layouts?
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Relevance: do the keywords and skills in the CV align with what the job description
              requires? Both must pass before a human reviewer sees the file. Useful Apply generates
              outputs optimized for both dimensions by default.
            </p>
          </div>
        </section>

        {/* H2: Why Formatting Matters */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Formatting</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Why Formatting Matters as Much as Keywords
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Single-column layouts parse more reliably than multi-column designs. Standard section
              headings (&quot;Work Experience&quot;, &quot;Education&quot;, &quot;Skills&quot;) are
              recognized by ATS parsers; creative headings risk being missed.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Tables and text boxes frequently cause parsing failures where content either
              disappears entirely or appears in the wrong field. Useful Apply uses ATS-safe templates:
              Arial and Georgia system fonts, single-column structure, standard bullet points, and
              consistent date formats across all 6 CV templates.
            </p>
          </div>
        </section>

        {/* H2: Keyword Matching */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Keywords</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Keyword Matching: How Useful Apply Aligns to Your Target Role
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              The AI extracts the top required skills, key responsibilities, and must-have keywords
              from the job description, then maps them against your verified CV content. If a skill
              you have is called &quot;Python&quot; on your CV and &quot;Python development&quot; in
              the job description, the tailored CV uses the job description&apos;s phrasing to
              maximize ATS match.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The system only uses keywords that correspond to actual skills in your source documents
              and it does not pad the CV with keywords you don&apos;t have.
            </p>
          </div>
        </section>

        {/* H2: ATS Systems Useful Apply Is Optimized For */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Platforms</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                ATS Systems Useful Apply Is Optimized For
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              The generated documents are designed for use in: Workday, Greenhouse, Lever, SAP
              SuccessFactors, iCIMS, and Taleo. These cover the majority of enterprise recruiting
              workflows in the US, UK, and EU.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              &quot;Optimized for&quot; means: clean upload parsing, text that copies stably into
              form fields, and structure that ATS routing systems can categorize correctly.
            </p>
          </div>
        </section>

        {/* H2: The Quick Compatibility Check */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Quick Check</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                The Quick Compatibility Check (2 Minutes)
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              After generating your package, run this check before submitting: upload the CV to the
              ATS form and verify that work history, job titles, and dates are correctly populated.
              Copy a skills section into a text field. If formatting breaks, the source document is
              too complex.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Confirm that a plain-text version of your cover letter is available for portals that
              require text fields instead of file uploads.
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
              href="/ai-job-application/integrations-workday-greenhouse-lever"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              Workday, Greenhouse &amp; Lever: Detailed Compatibility <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/ai-job-application/zero-fabrication"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              Zero-Fabrication: Why Accuracy Matters <ArrowRight className="w-4 h-4" />
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
                Generate Your ATS-Optimized Application
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                ATS-safe formatting, keyword alignment, and verified claims, all in under 90 seconds.
              </p>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
              >
                Generate Your ATS-Optimized Application
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
