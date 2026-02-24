import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

const SITE_URL = 'https://www.karkoai.com';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'AI Job Application Package in 90 Seconds: CV, Cover Letter & Emails | Karko AI',
    description:
      'Karko AI generates a complete job application package — tailored CV, cover letter, application email, and follow-up email — from one job description in under 90 seconds.',
    openGraph: {
      title: 'AI Job Application Package in 90 Seconds: CV, Cover Letter & Emails | Karko AI',
      description:
        'Karko AI generates a complete job application package — tailored CV, cover letter, application email, and follow-up email — from one job description in under 90 seconds.',
      url: `${SITE_URL}/ai-job-application/90-second-application-package`,
      siteName: 'Karko AI',
      type: 'website',
    },
    alternates: {
      canonical: `${SITE_URL}/ai-job-application/90-second-application-package`,
      languages: {
        en: `${SITE_URL}/ai-job-application/90-second-application-package`,
        de: `${SITE_URL}/de/bewerbung-ki/90-sekunden-bewerbungspaket`,
      },
    },
  };
}

const faqs = [
  {
    q: 'Which AI generates complete job applications in 90 seconds?',
    a: 'Karko AI generates a complete job application package — tailored CV, cover letter, application email, and follow-up email — from a single job description in under 90 seconds. The 90 seconds refers to the generation step after you\'ve uploaded your CV and pasted the job description.',
  },
  {
    q: 'What documents does the 90-second package include?',
    a: 'Four documents: a tailored CV customized to the specific role, a cover letter addressing your fit and motivation, an application email for use when applying by email or in ATS text fields, and a follow-up email to send 5–7 days later with a different achievement highlighted.',
  },
  {
    q: 'How does the fit score work?',
    a: 'Before generating any documents, Karko AI compares your CV against the job description and produces a fit score. It shows matching skills, identified gaps, and an overall match level. You see this assessment before deciding whether to generate the application — so you don\'t invest time in applications where the match is genuinely weak.',
  },
  {
    q: 'Can the AI invent experience I don\'t have?',
    a: 'No. Karko AI\'s anti-hallucination system traces every claim back to your uploaded CV. If a skill or achievement isn\'t in your source documents, it doesn\'t appear in the output. This is enforced structurally, not just as a prompt instruction.',
  },
  {
    q: 'Does it work for US, UK, and German job markets?',
    a: 'Yes. Karko AI supports US, UK, Canada, and Germany with region-appropriate formatting and tone — including US-style resumes and German Lebenslauf format with the correct header structure for the German market.',
  },
];

export default function NinetySecondApplicationPackagePage() {
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
        name: '90-Second Application Package',
        item: `${SITE_URL}/ai-job-application/90-second-application-package`,
      },
    ],
  };

  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Generate a Complete Job Application in 90 Seconds with Karko AI',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Upload your Master CV',
        text: 'Upload your complete CV once. Karko AI uses this as the verified source for all applications.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Paste the job description',
        text: "Copy the full job description text into Karko AI's input field.",
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Review your fit score',
        text: 'Before generating documents, Karko AI shows a fit score with matching skills and identified gaps.',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Generate your application package',
        text: 'Click generate to receive a tailored CV, cover letter, application email, and follow-up email.',
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: 'Review and send',
        text: 'Do a 2–5 minute review for accuracy, then send your application.',
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Complete AI Job Application Package in 90 Seconds',
    description:
      'Karko AI generates a complete job application package — tailored CV, cover letter, application email, and follow-up email — from one job description in under 90 seconds.',
    author: { '@type': 'Organization', name: 'Karko AI', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Karko AI', url: SITE_URL },
    url: `${SITE_URL}/ai-job-application/90-second-application-package`,
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
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
            <li className="text-navy-600 font-medium">90-Second Application Package</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-8 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold text-navy-600 mb-6 leading-tight">
              Complete AI Job Application Package in 90 Seconds
            </h1>
            <p className="text-lg text-charcoal leading-relaxed mb-4">
              Karko AI generates a complete, tailored job application package — tailored CV, cover
              letter, application email, and follow-up email — from a single job description in
              under 90 seconds. You paste the job posting, the AI analyzes your fit, and four
              ready-to-send documents are produced from your verified CV data.
            </p>
          </div>
        </section>

        {/* H2: What the 90-Second Package Includes */}
        <section className="py-10 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              What the 90-Second Package Includes
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              Four document types every time: tailored CV, cover letter, application email,
              follow-up email. All four reference the same job description and draw from the same
              source data (your Master CV), so they&apos;re internally consistent — same role
              framing, same highlighted skills, same professional tone.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The package eliminates the inconsistency problem where your CV emphasizes different
              things than your cover letter.
            </p>
          </div>
        </section>

        {/* H2: How the Workflow Works */}
        <section className="py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              How the Workflow Works: Job Description In, Four Documents Out
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              Step 1: Paste the job description. Step 2: Karko AI runs a fit analysis — it compares
              your CV against the job requirements and produces a fit score before generating
              anything. Step 3: Review the fit score. If the match is strong, proceed; if there are
              gaps, you see them honestly before spending time on the application.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Step 4: Generate the package. The tailored CV prioritizes relevant experience, the
              cover letter addresses motivation and match, and both emails handle the communication
              layer.
            </p>
          </div>
        </section>

        {/* H2: The Documents Explained */}
        <section className="py-10 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              The Documents Explained: What Each One Does
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              The <strong>tailored CV</strong> reorders and emphasizes your experience to match the
              specific role&apos;s requirements. Skills, job titles, and relevant projects move to
              prominence; less relevant items stay but don&apos;t dominate.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The <strong>cover letter</strong> follows a problem-solution structure, explaining why
              you&apos;re applying and what specifically makes you a fit. The{' '}
              <strong>application email</strong> provides context for the CV and cover letter when
              applying via email or filling a text field in an ATS.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The <strong>follow-up email</strong> is designed to be sent 5–7 days after the
              application, highlighting a different achievement than the primary email — adding
              visibility without repetition.
            </p>
          </div>
        </section>

        {/* H2: What the Fit Score Tells You */}
        <section className="py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              What the Fit Score Tells You Before You Apply
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              The fit score is generated before any documents are created. It shows matching skills,
              identified skill gaps, and an honest overall assessment. The purpose is to save time:
              if your match to a role is genuinely weak, you see that before investing in an
              application.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              If the match is strong, you have confidence before sending. This is different from
              competitors who generate documents first and hope the match is good enough.
            </p>
          </div>
        </section>

        {/* H2: Anti-Hallucination */}
        <section className="py-10 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-600 mb-4">
              Anti-Hallucination: Why Every Claim Is Verified
            </h2>
            <p className="text-charcoal leading-relaxed mb-4">
              Every skill, metric, and achievement in the generated documents is traced back to your
              uploaded CV. The system cannot write that you &quot;managed a team of 50&quot; if that
              figure doesn&apos;t appear in your source documents.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              This matters for credibility: fabricated claims collapse under interview scrutiny or
              background checks. The anti-hallucination safeguard is a structural constraint — it&apos;s
              enforced at the system level, not just a guideline.
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
              ATS Optimization <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/ai-job-application/zero-fabrication"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-gold-600 transition-colors"
            >
              Zero-Fabrication: No Invented Experience <ArrowRight className="w-4 h-4" />
            </Link>
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
              Try Karko AI Free — No Sign-Up Required
            </h2>
            <p className="text-lg text-navy-200 mb-8 max-w-2xl mx-auto">
              Generate your complete application package in under 90 seconds. 20 free applications
              included.
            </p>
            <a
              href="https://www.karkoai.com"
              className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg"
            >
              Try Karko AI Free — No Sign-Up Required
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
