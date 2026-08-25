import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';

import { SEO_SITE_URL } from '@/lib/seo/site-url';

const SITE_URL = SEO_SITE_URL;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'AI Job Application Guide',
    description:
      'AI job applications in one place: 90-second workflow, ATS optimization, zero-fabrication, integrations, pricing, and Master CV templates.',
    canonical: '/ai-job-application',
  });
}

const pillars = [
  {
    title: 'Full Application in 90 Seconds',
    description:
      'One job description in, four tailored documents out: CV, cover letter, application email, and follow-up email, all in under 90 seconds.',
    href: '/ai-job-application/90-second-application-package',
    linkText: 'full application in 90 seconds →',
  },
  {
    title: 'Free Test, No Sign-Up Required',
    description:
      'Try 2 full applications without creating an account or entering payment details. Evaluate output quality before committing.',
    href: '/ai-job-application/free-no-signup-test',
    linkText: 'Test without signing up →',
  },
  {
    title: 'ATS Optimization',
    description:
      'Keyword alignment, single-column formatting, and compatibility with Workday, Greenhouse, Lever, and more.',
    href: '/ai-job-application/ats-optimization',
    linkText: 'ATS optimization guide →',
  },
  {
    title: 'Zero-Fabrication: No Invented Experience',
    description:
      'Every claim verified against your uploaded CV. No fabricated skills, metrics, or roles, enforced structurally.',
    href: '/ai-job-application/zero-fabrication',
    linkText: 'Zero-fabrication: no invented experience →',
  },
  {
    title: 'Workday, Greenhouse & Lever Compatibility',
    description:
      'How Useful Apply documents upload, parse, and submit through major ATS platforms without reformatting.',
    href: '/ai-job-application/integrations-workday-greenhouse-lever',
    linkText: 'Workday, Greenhouse & Lever compatibility →',
  },
  {
    title: 'Pricing & Credits',
    description:
      'Free (2 applications), Plus $19.99/month (25 applications), Max $79.99/month (100 applications). Transparent credit-based pricing.',
    href: '/ai-job-application/pricing-credits',
    linkText: 'Pricing & credits explained →',
  },
  {
    title: 'Master CV Template',
    description:
      'Build your complete, structured source document once and use it for every AI-generated application.',
    href: '/master-cv-template',
    linkText: 'Build your Master CV →',
  },
  {
    title: 'AI Cover Letter Generator',
    description:
      'Generate a tailored, ATS-optimized cover letter in 90 seconds. Built from your real CV, grounded in the specific role. No templates, no fabrication.',
    href: '/ai-job-application/cover-letter-generator',
    linkText: 'AI cover letter generator →',
  },
  {
    title: 'Follow-Up Email Generator',
    description:
      'Most candidates never follow up. Useful Apply drafts a professional follow-up email for 7 to 10 days after applying, built from your real CV.',
    href: '/ai-job-application/follow-up-email-generator',
    linkText: 'Follow-up email generator →',
  },
  {
    title: 'Application Tracker',
    description:
      'Track 100+ applications with status, match scores, and deadlines. Automatically saves every application you generate.',
    href: '/ai-job-application/application-tracker',
    linkText: 'Application tracker →',
  },
];

const faqs = [
  {
    q: 'What does "AI job application" actually mean?',
    a: 'It means using an AI tool to generate tailored application documents from a job description and your profile. The critical element is process: you need a reliable data source (your uploaded CV), verify the output for accuracy, and ensure the result is readable by ATS systems. AI replaces the hour of manual work per application, not your actual facts.',
  },
  {
    q: 'Is an AI-generated job application professional?',
    a: 'Yes, when used as an assistant. AI can structure text, write more clearly, and adapt faster to a specific role. It becomes unprofessional when content is fabricated or accepted without review. Maintaining consistency, verifiable claims, and clean document structure keeps the application credible.',
  },
  {
    q: 'Do I need to sign up to test an AI job application tool?',
    a: "Not necessarily. Useful Apply's Free plan lets you create 2 applications per month without requiring a paid subscription, and you can see the output quality before committing to any plan.",
  },
  {
    q: "How do I prevent AI from making up experience I don't have?",
    a: "Work from clean source data, a CV that contains only verified facts, and check every generated claim before sending. Useful Apply traces every output back to your uploaded CV and refuses to invent skills, metrics, or roles that aren't documented there. Never a word you didn't earn.",
  },
  {
    q: 'What does ATS optimization actually mean?',
    a: "ATS (Applicant Tracking Systems) parse your CV and match it against job requirements before a human reads it. ATS optimization means: clean single-column formatting (no tables, text boxes, or complex layouts), standard section headings, consistent date formats, and keyword alignment with the job description. Useful Apply generates ATS-optimized CVs by default.",
  },
  {
    q: 'What documents does Useful Apply generate?',
    a: "A full application: tailored CV, cover letter, application email, and follow-up email. On Plus and Max, screening question answers as well. All reference the same job description and draw from your real CV, so they're consistent in tone, claims, and emphasis.",
  },
  {
    q: 'Does it work for jobs outside Germany?',
    a: 'Yes. Useful Apply supports US, UK, Canada, and Germany markets with region-appropriate formatting, tone, and templates, including US Letter resumes and German Lebenslauf format.',
  },
];

export default function AIJobApplicationHub() {
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
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI Job Application Topics',
    itemListElement: pillars.map((pillar, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: pillar.title,
      url: `${SITE_URL}${pillar.href}`,
    })),
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'AI Job Application: Tools, Workflow, ATS & Templates',
    description:
      'Everything about AI job applications in one place: 90-second workflow, ATS optimization, zero-fabrication, integrations, pricing, and Master CV templates.',
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application`,
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <main>
        {/* Breadcrumb */}
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-2">
          <ol className="flex items-center gap-2 text-sm text-warm-gray">
            <li>
              <Link href="/" className="hover:text-navy-600 transition-colors">
                Home
              </Link>
            </li>
            <li>/</li>
            <li className="text-navy-600 font-medium">AI Job Application</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">AI Job Application Hub</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                AI Job Application: Tools, Workflow, ATS &amp; Templates
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                An AI job application agent takes a single job description and generates a full
                application, tailored CV, cover letter, application email, and follow-up email, in
                under 90 seconds. The key to making it work is a reliable process: your real CV as
                the source of truth, ATS-compatible output, and a final review before you send.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: What Goes Wrong */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Common Pitfalls</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What Goes Wrong With AI Job Applications and How to Fix It
              </h2>
            </ScrollReveal>
            <div className="grid md:grid-cols-2 gap-8">
              <ScrollReveal delay={100}>
                <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm">
                  <h3 className="text-lg font-bold text-charcoal mb-3">The Problem</h3>
                  <p className="text-warm-gray leading-relaxed">
                    Most AI applications fail not because of bad AI but because of wrong
                    expectations. People copy text without matching it to the specific role,
                    without clean source data, and without checking how ATS systems read the file.
                  </p>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm">
                  <h3 className="text-lg font-bold text-charcoal mb-3">The Fix</h3>
                  <p className="text-warm-gray leading-relaxed">
                    (1) Understand the role, (2) use your own stable data as the base (Master CV),
                    (3) output documents that ATS can process, (4) only automate where it genuinely
                    saves time. When AI fabricates content, credibility collapses in the interview.
                  </p>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* H2: What Useful Apply Generates */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Your Complete Package</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What Useful Apply Generates in 90 Seconds
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
                One input (job description), four outputs: tailored CV, cover letter, application
                email, and follow-up email. Every document references the same job description and draws
                from the same verified source, so they are consistent.
              </p>
              <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
                The fit score tells you how well your background matches the role before documents are
                generated. Anti-hallucination safeguards mean no skills, metrics, or experience are
                fabricated.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: The 7 Topics */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <div className="text-center mb-10">
                <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Explore</p>
                <h2 className="text-3xl md:text-4xl font-bold text-navy-600">
                  The 10 Topics This Hub Covers
                </h2>
              </div>
            </ScrollReveal>
            <div className="grid sm:grid-cols-2 gap-5">
              {pillars.map((pillar, i) => (
                <ScrollReveal key={pillar.href} delay={i * 80}>
                  <Link
                    href={pillar.href}
                    className="block bg-white rounded-2xl border border-cream-200 p-7 hover:border-gold-300 hover:shadow-md transition-all card-hover-lift h-full"
                  >
                    <h3 className="text-lg font-bold text-charcoal mb-2">{pillar.title}</h3>
                    <p className="text-warm-gray text-sm leading-relaxed mb-4">
                      {pillar.description}
                    </p>
                    <span className="text-gold-500 text-sm font-semibold inline-flex items-center gap-1">
                      {pillar.linkText} <ArrowRight className="w-4 h-4" />
                    </span>
                  </Link>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* H2: Recent Trends */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Industry Trends</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Recent Trends in AI Job Applications
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
                Recruiter tools and online application forms are the standard. Applications must not
                just read well but be technically submittable (upload, parsing, structure).
              </p>
              <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
                The trend is toward faster iteration: applicants test multiple versions rather than
                spending weeks on one perfect application. Trust is becoming more
                important. The more AI content circulates, the more consistency, verifiability, and
                zero-fabrication matter.
              </p>
            </ScrollReveal>
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
                Ready to Try AI Job Applications?
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                Generate a full application in under 90 seconds. Free tier
                includes 2 applications free, no sign-up required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/dashboard"
                  className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg inline-flex items-center gap-2"
                >
                  Try Useful Apply Free
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/pricing"
                  className="px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/30 hover:shadow-xl hover:scale-[1.02] hover:border-gold-400/50 transition-all duration-300 text-lg"
                >
                  View Pricing
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
