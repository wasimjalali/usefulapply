import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';

import { BRAND } from '@/lib/brand';

const SITE_URL = BRAND.url;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Workday, Greenhouse & Lever Compatibility',
    description:
      "How Useful Apply documents work in Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, and Taleo. Upload, parsing, and copy-paste ready.",
    canonical: '/ai-job-application/integrations-workday-greenhouse-lever',
  });
}

const faqs = [
  {
    q: 'Which AI job application tool works well with Workday?',
    a: "Useful Apply generates documents in Workday-compatible format (single-column CV, standard section headings, clean date formats) specifically designed to parse correctly when uploaded to Workday's recruiting forms.",
  },
  {
    q: 'Does Useful Apply integrate directly with Workday or Greenhouse?',
    a: 'No. Useful Apply is not a Workday or Greenhouse plugin. It generates ATS-optimized documents that upload and parse correctly in these systems. Think of it as producing the right input, not automating the submission step.',
  },
  {
    q: 'What CV format works best for Workday uploads?',
    a: 'Single-column layout, no tables for critical content, standard section headings, consistent date formats, and system fonts like Arial. Useful Apply applies all of these constraints in its generated CVs.',
  },
  {
    q: "How do I use Useful Apply's output in Greenhouse application forms?",
    a: 'Upload the tailored CV as your resume file. Use the cover letter content for any cover letter field. For custom text questions about motivation or specific skills, the cover letter and application email provide ready-to-adapt paragraphs. The follow-up email is saved separately for use 5 to 7 days after submitting.',
  },
  {
    q: 'Does the generated output work for US and EU ATS systems?',
    a: 'Yes. Useful Apply supports both markets. US and UK applications use standard resume format (typically 1 to 2 pages). German applications use Lebenslauf format with the appropriate German-market header structure. The ATS compatibility considerations are the same across markets.',
  },
];

export default function IntegrationsWorkdayGreenhouseLeverPage() {
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
        name: 'Workday, Greenhouse & Lever',
        item: `${SITE_URL}/ai-job-application/integrations-workday-greenhouse-lever`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'AI Job Applications for Workday, Greenhouse & Lever: Compatibility Guide',
    description:
      "How Useful Apply's generated documents work in Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, and Taleo. Upload workflows, parsing, and copy-paste compatibility.",
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/integrations-workday-greenhouse-lever`,
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
            <li className="text-navy-600 font-medium">Workday, Greenhouse &amp; Lever</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">ATS Integrations</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                AI Job Applications for Workday, Greenhouse &amp; Lever
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                Compatible with Workday, Greenhouse, and Lever means the AI-generated
                documents can be uploaded, parsed, and submitted through these systems without
                reformatting. Useful Apply produces ATS-optimized output: single-column CV structure,
                clean text for cover letter fields, and ready-to-paste email templates, all
                designed for how these systems ingest applications.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
                >
                  Try ATS-Compatible Applications Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: What "Compatible" Really Means */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Compatibility</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What &quot;Compatible&quot; Really Means
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Compatibility is not about a software integration. It means: (1) the CV can be
              uploaded and parsed with correct work history, job titles, education, and skills
              populated in the right ATS fields; (2) cover letter and cover text can be copy-pasted
              into text fields without formatting breaking; (3) the application email is ready for
              use when the process switches to email submission.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              This is what Useful Apply optimizes for: not a built-in connector, but documents that
              work cleanly in real ATS workflows.
            </p>
          </div>
        </section>

        {/* H2: Workday */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Workday</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Workday: What to Expect
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Workday forms often include 10 to 40 required fields that must be populated from your CV
              data. The most reliable upload path: a clean single-column CV without tables or text
              boxes. After upload, verify that employer names, job titles, and dates in the work
              history fields are correctly parsed.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              If fields are incorrect, the clean-text version of your CV sections can be copy-pasted
              directly. Useful Apply generates the CV in ATS-safe format by default to reduce this
              correction step.
            </p>
          </div>
        </section>

        {/* H2: Greenhouse & Lever */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Greenhouse & Lever</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Greenhouse &amp; Lever: Key Differences
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Greenhouse and Lever are commonly used by tech companies and startups, especially in
              the US market. Both support PDF and Word uploads with generally cleaner parsing than
              older systems. Both also frequently use custom questions and text fields for skills,
              cover letters, or motivation answers.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Useful Apply&apos;s cover letter and application email serve as the content source for
              these fields. They are written to be adaptable to both full-document and
              text-field use cases.
            </p>
          </div>
        </section>

        {/* H2: The 2-Minute Compatibility Check */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Quick Check</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                The 2-Minute Compatibility Check
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Before submitting any application: (1) Upload the CV and check that work history, job
              titles, and education appear correctly in the ATS-populated fields. (2) Copy a skills
              section into a text field. If formatting breaks, the source document layout is too
              complex.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              (3) Confirm a plain-text cover letter version is available. (4) Keep the application
              email and follow-up email as separate text files for use when the process requires
              email rather than portal submission.
            </p>
          </div>
        </section>

        {/* H2: SAP SuccessFactors, iCIMS, and Taleo */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Enterprise ATS</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                SAP SuccessFactors, iCIMS, and Taleo
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              These enterprise ATS platforms are common in large organizations across all markets.
              They&apos;re generally stricter about formatting than Greenhouse or Lever.
              Single-column layout and standard section headings are particularly important for clean
              parsing in these systems.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Useful Apply&apos;s ATS-optimized templates are designed with these constraints in mind.
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
              ATS Optimization: Keywords &amp; Format <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/ai-job-application/pricing-credits"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              Pricing for High-Volume Applications <ArrowRight className="w-4 h-4" />
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
                Generate Your ATS-Ready Package
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                Documents optimized for Workday, Greenhouse, Lever, and more. Ready to upload in
                under 90 seconds.
              </p>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
              >
                Generate Your ATS-Ready Package
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
