import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

const SITE_URL = 'https://www.karkoai.com';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'AI Job Application: Complete Guide to Tools, ATS & Workflow | Karko AI',
    description:
      'Everything about AI job applications in one place: 90-second workflow, ATS optimization, zero-fabrication, integrations, pricing, and Master CV templates.',
    openGraph: {
      title: 'AI Job Application: Complete Guide to Tools, ATS & Workflow | Karko AI',
      description:
        'Everything about AI job applications in one place: 90-second workflow, ATS optimization, zero-fabrication, integrations, pricing, and Master CV templates.',
      url: `${SITE_URL}/ai-job-application`,
      siteName: 'Karko AI',
      type: 'website',
    },
    alternates: {
      canonical: `${SITE_URL}/ai-job-application`,
      languages: {
        en: `${SITE_URL}/ai-job-application`,
        de: `${SITE_URL}/de/bewerbung-ki`,
      },
    },
  };
}

const pillars = [
  {
    title: '90-Second AI Application Package',
    description:
      'One job description in, four tailored documents out — CV, cover letter, application email, and follow-up email — in under 90 seconds.',
    href: '/ai-job-application/90-second-application-package',
    linkText: '90-second AI application package →',
  },
  {
    title: 'Free Test — No Sign-Up Required',
    description:
      'Try 20 full applications without creating an account or entering payment details. Evaluate output quality before committing.',
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
      'Every claim verified against your uploaded CV. No fabricated skills, metrics, or roles — enforced structurally.',
    href: '/ai-job-application/zero-fabrication',
    linkText: 'Zero-fabrication: no invented experience →',
  },
  {
    title: 'Workday, Greenhouse & Lever Compatibility',
    description:
      'How Karko AI documents upload, parse, and submit through major ATS platforms without reformatting.',
    href: '/ai-job-application/integrations-workday-greenhouse-lever',
    linkText: 'Workday, Greenhouse & Lever compatibility →',
  },
  {
    title: 'Pricing & Credits',
    description:
      'Free (20 applications), Plus $29.99/month (60 applications), Pro $49.99/month (120 applications). Transparent credit-based pricing.',
    href: '/ai-job-application/pricing-credits',
    linkText: 'Pricing & credits explained →',
  },
  {
    title: 'Master CV Template',
    description:
      'Build your complete, structured source document once — use it for every AI-generated application.',
    href: '/master-cv-template',
    linkText: 'Build your Master CV →',
  },
];

const faqs = [
  {
    q: 'What does "AI job application" actually mean?',
    a: 'It means using an AI tool to generate tailored application documents from a job description and your profile. The critical element is process: you need a reliable data source (a Master CV), verify the output for accuracy, and ensure the result is readable by ATS systems. AI replaces the 45–60 minutes of manual work per application — not your actual facts.',
  },
  {
    q: 'Is an AI-generated job application professional?',
    a: 'Yes, when used as an assistant. AI can structure text, write more clearly, and adapt faster to a specific role. It becomes unprofessional when content is fabricated or accepted without review. Maintaining consistency, verifiable claims, and clean document structure keeps the application credible.',
  },
  {
    q: 'Do I need to sign up to test an AI job application tool?',
    a: "Not necessarily. Karko AI's free tier lets you create 20 applications without requiring a paid subscription, and you can see the output quality before committing to any plan.",
  },
  {
    q: "How do I prevent AI from making up experience I don't have?",
    a: "Work from clean source data — a Master CV that contains only verified facts — and check every generated claim before sending. Karko AI's anti-hallucination system traces every output back to your uploaded CV and refuses to invent skills, metrics, or roles that aren't documented there.",
  },
  {
    q: 'What does ATS optimization actually mean?',
    a: "ATS (Applicant Tracking Systems) parse your CV and match it against job requirements before a human reads it. ATS optimization means: clean single-column formatting (no tables, text boxes, or complex layouts), standard section headings, consistent date formats, and keyword alignment with the job description. Karko AI generates ATS-optimized CVs by default.",
  },
  {
    q: 'What documents does Karko AI generate?',
    a: "A complete package: tailored CV, cover letter, application email, and follow-up email. All four reference the same job description and draw from the same source data, so they're consistent in tone, claims, and emphasis.",
  },
  {
    q: 'Does it work for jobs outside Germany?',
    a: 'Yes. Karko AI supports US, UK, Canada, and Germany markets with region-appropriate formatting, tone, and templates — including US Letter resumes and German Lebenslauf format.',
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
    author: { '@type': 'Organization', name: 'Karko AI', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Karko AI', url: SITE_URL },
    url: `${SITE_URL}/ai-job-application`,
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
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
            <li className="text-navy-600 font-medium">AI Job Application</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-8 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold text-navy-600 mb-6 leading-tight">
              AI Job Application: Tools, Workflow, ATS &amp; Templates
            </h1>
            <p className="text-lg text-charcoal leading-relaxed mb-4">
              An AI job application tool takes a single job description and generates a complete,
              personalized application package — tailored CV, cover letter, application email, and
              follow-up email — in under 90 seconds. The key to making it work is a reliable
              process: clean source data (a Master CV), ATS-compatible output, and a final accuracy
              check before sending.
            </p>
          </div>
        </section>

        {/* H2: What Goes Wrong */}
        <section className="py-10 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              What Goes Wrong With AI Job Applications — and How to Fix It
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              Most AI applications fail not because of &quot;bad AI&quot; but because of wrong
              expectations. People copy text from a generator without matching it to the specific
              role, without clean source data, and without checking how recruiter tools (ATS) read
              the file.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Add the trust problem: when AI fabricates content, credibility collapses in the
              interview. The method: (1) understand the role, (2) use your own stable data as the
              base (Master CV), (3) output documents that ATS can process, (4) only automate where
              it genuinely saves time.
            </p>
          </div>
        </section>

        {/* H2: What Karko AI Generates */}
        <section className="py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              What Karko AI Generates in 90 Seconds
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              One input (job description), four outputs — tailored CV, cover letter, application
              email, follow-up email. Every document references the same job description and draws
              from the same verified source, so they&apos;re consistent.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The fit score tells you how well your background matches the role before documents are
              generated. Anti-hallucination safeguards mean no skills, metrics, or experience are
              fabricated.
            </p>
          </div>
        </section>

        {/* H2: The 7 Topics */}
        <section className="py-10 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-6">
              The 7 Topics This Hub Covers
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {pillars.map((pillar) => (
                <Link
                  key={pillar.href}
                  href={pillar.href}
                  className="block bg-white rounded-xl border border-cream-200 p-6 hover:border-gold-300 hover:shadow-md transition-all"
                >
                  <h3 className="text-lg font-bold text-charcoal mb-2">{pillar.title}</h3>
                  <p className="text-warm-gray text-sm leading-relaxed mb-3">
                    {pillar.description}
                  </p>
                  <span className="text-gold-500 text-sm font-semibold inline-flex items-center gap-1">
                    {pillar.linkText} <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* H2: Recent Trends */}
        <section className="py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              Recent Trends in AI Job Applications
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              Recruiter tools and online application forms are the standard — applications must not
              just read well but be technically submittable (upload, parsing, structure).
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The trend is toward faster iteration: applicants test multiple versions rather than
              spending weeks on one &quot;perfect&quot; application. Trust is becoming more
              important: the more AI content circulates, the more consistency, verifiability, and
              zero-fabrication matter.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-8">
              Frequently Asked Questions
            </h2>
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
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Try AI Job Applications?
            </h2>
            <p className="text-lg text-navy-200 mb-8 max-w-2xl mx-auto">
              Generate a complete, tailored application package in under 90 seconds. Free tier
              includes 20 applications — no sign-up required.
            </p>
            <a
              href="https://www.karkoai.com"
              className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
            >
              Try Karko AI Free
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
