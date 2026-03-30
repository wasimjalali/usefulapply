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
    title: 'AI Cover Letter Generator — Personalized in 90 Seconds',
    description:
      'Generate personalized, ATS-optimized cover letters with AI. No templates, no fabrication. Customized cover letters increase callbacks by 50%. Try free.',
    canonical: '/ai-job-application/cover-letter-generator',
  });
}

const faqs = [
  {
    q: 'How does an AI cover letter generator work?',
    a: "An AI cover letter generator analyzes the job description, extracts key requirements, maps them to your CV experience, and writes a personalized cover letter that explains your fit. Karko AI generates cover letters in 90 seconds as part of a complete application package (CV, cover letter, application email, follow-up email).",
  },
  {
    q: 'Are AI-generated cover letters better than templates?',
    a: 'Yes. Templates are generic and easily recognized by hiring managers. AI-generated cover letters are personalized to the specific job description and your experience, referencing exact requirements and achievements. Research shows customized cover letters increase callback rates by over 50% compared to generic templates.',
  },
  {
    q: 'Will the AI fabricate experience I don\'t have?',
    a: "Not if the tool has anti-hallucination safeguards. Karko AI enforces strict traceability: every claim in the cover letter must map back to your uploaded CV. If you don't have AWS experience, the cover letter won't mention AWS. No fabricated skills or metrics.",
  },
  {
    q: 'How long is an AI-generated cover letter?',
    a: 'Karko AI generates cover letters between 250 and 350 words (3 to 4 paragraphs). This length is optimal: long enough to demonstrate genuine interest and fit, short enough to be read in 90 seconds by a busy hiring manager.',
  },
  {
    q: 'Can I edit the AI-generated cover letter before sending?',
    a: 'Yes. Karko AI outputs editable text. You can adjust tone, add company-specific details, or emphasize different achievements before downloading or copying. The AI gives you a strong starting point; you control the final version.',
  },
];

export default function CoverLetterGeneratorPage() {
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
        name: 'Cover Letter Generator',
        item: `${SITE_URL}/ai-job-application/cover-letter-generator`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'AI Cover Letter Generator: Personalized in 90 Seconds, No Templates',
    description:
      'Learn how Karko AI generates personalized, ATS-optimized cover letters without fabrication. Customized cover letters increase callbacks by 50%.',
    author: { '@type': 'Organization', name: 'KarKo AI', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'KarKo AI',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/karko-ai.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/cover-letter-generator`,
    datePublished: '2026-03-25',
    dateModified: '2026-03-30',
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
            <li className="text-navy-600 font-medium">Cover Letter Generator</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">AI Cover Letter Generator</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                AI Cover Letter Generator: Personalized in 90 Seconds, No Templates
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                An AI cover letter generator analyzes the job description, maps your relevant
                experience from your CV, and writes a personalized cover letter that demonstrates
                your fit for the role. Karko AI generates cover letters in 90 seconds with
                anti-hallucination safeguards, meaning every claim traces back to your uploaded
                CV with no fabricated experience.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
                >
                  Generate Your Cover Letter Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: Why Templates Fail */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The Problem with Templates</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Why Generic Cover Letter Templates Don&apos;t Work
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Generic cover letter templates start with &quot;Dear Hiring Manager, I am writing
              to express my interest in the [Job Title] position at [Company Name].&quot;
              Recruiters see this opening 200 times per role. It signals you didn&apos;t put in
              any effort.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Research shows that <strong>customized cover letters increase callback rates by
              over 50% compared to generic templates.</strong> The difference isn&apos;t length
              or writing quality. It&apos;s relevance. A personalized cover letter references
              specific job requirements, your specific achievements, and the specific company
              context. A template does none of that.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The problem is that writing a personalized cover letter manually takes 15 to 20
              minutes per job. If you&apos;re applying to 100 jobs, that&apos;s 33 hours of
              writing. Most job seekers can&apos;t sustain that, so they either use templates
              (low callback rate) or apply to fewer jobs (not enough volume to get results).
            </p>
          </div>
        </section>

        {/* H2: How AI Solves This */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The AI Solution</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                How AI Generates Personalized Cover Letters in 90 Seconds
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              An AI cover letter generator does three things: (1) analyzes the job description
              to extract key requirements and company context, (2) maps those requirements to
              your real experience from your uploaded CV, and (3) writes a personalized cover
              letter that explains your fit using natural language and professional tone.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Karko AI generates cover letters as part of a complete application
              package:</strong> tailored CV, cover letter, application email, and follow-up
              email. All four documents reference the same job description and draw from the same
              verified source (your Master CV), so they&apos;re consistent in tone, claims, and
              emphasis.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The cover letter opens with a specific achievement (not a cliché), references the
              exact job requirements, explains why you&apos;re interested in this company, and
              closes with a forward-looking statement. Length: 250 to 350 words. Time to
              generate: 90 seconds.
            </p>
          </div>
        </section>

        {/* H2: Anti-Hallucination */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Zero Fabrication</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Anti-Hallucination: No Invented Experience
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              The biggest risk with AI writing tools is fabrication. Many AI tools see a job
              requirement for &quot;AWS&quot; and write &quot;I have extensive AWS
              experience&quot; even if your CV never mentions AWS. This backfires in the
              interview when you can&apos;t answer basic AWS questions.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Karko AI enforces strict traceability.</strong> Every skill, metric, and
              claim in the cover letter must map back to your uploaded CV. If you don&apos;t have
              AWS experience, the cover letter won&apos;t mention AWS. If your CV says you
              &quot;improved query performance by 40%,&quot; the cover letter can reference that
              exact metric. If your CV doesn&apos;t have a metric, the cover letter won&apos;t
              invent one.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              This is enforced structurally: the AI agent is explicitly forbidden from inventing
              skills, roles, or achievements. If it tries to fabricate, the output is rejected
              and regenerated. This safeguard is what separates AI-assisted writing from
              AI-generated lies.
            </p>
          </div>
        </section>

        {/* H2: Structure and Tone */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Quality Output</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What a Good AI-Generated Cover Letter Looks Like
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              A well-structured AI cover letter follows this pattern:
            </p>
            <div className="bg-cream-50 border border-cream-200 rounded-xl p-6 mb-6">
              <p className="text-charcoal leading-relaxed mb-3">
                <strong>Paragraph 1: Strong opening.</strong> Open with a specific achievement
                or reason you&apos;re interested in this role. Not &quot;I am writing to express
                my interest.&quot;
              </p>
              <p className="text-charcoal leading-relaxed mb-3">
                <strong>Paragraph 2: Fit and relevance.</strong> Explain how your experience
                aligns with the role&apos;s top 2 to 3 requirements. Use specific examples from
                your CV.
              </p>
              <p className="text-charcoal leading-relaxed mb-3">
                <strong>Paragraph 3: Company-specific interest.</strong> Reference something
                specific about the company (mission, product, recent news) that shows you&apos;ve
                done research.
              </p>
              <p className="text-charcoal leading-relaxed">
                <strong>Paragraph 4: Closing.</strong> Brief, confident, forward-looking. Thank
                them for their time and express interest in discussing further.
              </p>
            </div>
            <p className="text-charcoal leading-relaxed mb-4">
              Karko AI generates cover letters following this structure automatically. The tone
              is professional but not robotic, confident but not arrogant, specific but not
              verbose. The output reads like a human wrote it, because the AI is trained on
              high-quality, real-world cover letters, not generic templates.
            </p>
          </div>
        </section>

        {/* H2: Speed and Volume */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The Math</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Why Speed Matters: Volume + Quality
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Writing 100 cover letters manually takes 33 hours (20 minutes per letter). Most job
              seekers don&apos;t have 33 hours, so they either (1) send generic templates and get
              a 2% callback rate, or (2) hand-write 10 letters and don&apos;t apply to enough
              jobs to get results.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Karko AI reduces that 33 hours to 2.5 hours.</strong> Same quality. 95%
              faster. This isn&apos;t just about speed. It&apos;s about unlocking the volume +
              quality strategy that works: apply to every relevant role with a personalized cover
              letter, not just the handful you have time to hand-write.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Customized cover letters get 50% more callbacks than generic ones. That&apos;s the
              difference between 4 interviews out of 100 applications and 6 interviews. Over a
              3-month job search, that&apos;s the difference between 1 offer and 2 or 3 offers.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
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
                  className="bg-cream-50 rounded-xl border border-cream-200 p-6"
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
                Generate Your First AI Cover Letter Free
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                Try Karko AI free for your first 5 applications. Get a personalized cover letter
                in 90 seconds, plus tailored CV, application email, and follow-up email. No
                credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/dashboard"
                  className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg inline-flex items-center gap-2"
                >
                  Try Karko AI Free
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/ai-job-application"
                  className="px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/30 hover:shadow-xl hover:scale-[1.02] hover:border-gold-400/50 transition-all duration-300 text-lg inline-flex items-center gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back to Guide
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
