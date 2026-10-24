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
    title: 'Master CV Template',
    description:
      'Build a complete Master CV once, use it for every AI-generated application. Template, structure, and workflow in 45 to 90 minutes.',
    canonical: '/master-cv-template',
  });
}

const faqs = [
  {
    q: 'What is a Master CV and why do I need one?',
    a: "A Master CV is your complete professional record (every role, skill, achievement, and qualification) in a single ATS-compatible document. You maintain it once and use it as the source for all tailored applications. In Useful Apply, uploading your Master CV means the AI has access to your full professional history and can select and emphasize the right elements for each specific job description.",
  },
  {
    q: 'How long should a Master CV be?',
    a: "As long as it needs to be to capture your full professional history. A Master CV is intentionally comprehensive: 3 to 5 pages is common for experienced professionals. Length is not a concern because it's never sent directly to employers; tailored CVs derived from it are typically 1 to 2 pages.",
  },
  {
    q: 'How do I structure the work history section?',
    a: 'Per role: employer name, location, dates (Month Year to Month Year), job title, and 4 to 10 bullet points using the Verb + Object + Context + Result formula. Aim for a mix of responsibility bullets and outcome bullets. Keep two variants per role if possible, one emphasizing day-to-day ownership and one emphasizing results and scope, to make later tailoring easier.',
  },
  {
    q: 'What formatting makes a Master CV ATS-compatible?',
    a: 'Single-column layout, standard section headings, system fonts (Arial body, Georgia headers), consistent date format, and standard bullet points. No tables for critical data, no text boxes, no multi-column layouts. The goal is reliable parsing by systems like Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, and Taleo.',
  },
  {
    q: 'How often should I update my Master CV?',
    a: 'After every significant project completion, and during any major skills or certification change. Monthly light review catches anything missed. The Master CV is a living document. Treating it as a one-time artifact is the most common reason it stops being useful.',
  },
];

export default function MasterCVTemplatePage() {
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
        name: 'Master CV Template',
        item: `${SITE_URL}/master-cv-template`,
      },
    ],
  };

  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Build a Master CV in 45 to 90 Minutes',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Create structure with fixed headings',
        text: 'Create a blank document with fixed headings: Header, Summary, Skills, Work History, Education, Certifications, Languages.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Write your work history',
        text: 'Start with your most recent role. Write everything: raw, uncurated. Projects, responsibilities, tech stack, stakeholders, outcomes.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Convert to bullet points',
        text: 'Convert each role into 6–12 bullet points using the Verb + Object + Context + Result format.',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Extract skills',
        text: 'Anything appearing multiple times in work history goes into the Technical Skills section.',
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: 'Add Education, Certifications, Languages',
        text: 'Complete the remaining sections with degree, institution, dates, certifications with issuer and year, and language levels.',
      },
      {
        '@type': 'HowToStep',
        position: 6,
        name: 'Consistency pass',
        text: 'Standardize job titles, company names, date format, and tool names across the entire document.',
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Master CV Template: Build Your Foundation for AI Job Applications',
    description:
      'A Master CV is your complete, structured source document. Build it once, use it for every AI-generated application. Template, structure, and workflow in 45–90 minutes.',
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/master-cv-template`,
    datePublished: '2026-02-24',
    dateModified: '2026-03-29',
  };

  return (
    <div className="min-h-screen bg-canvas">
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
          <ol className="flex items-center gap-2 text-sm text-ink-muted">
            <li>
              <Link href="/" className="hover:text-brand transition-colors">
                Home
              </Link>
            </li>
            <li>/</li>
            <li className="text-brand font-medium">Master CV Template</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-4">Master CV</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-brand mb-6 leading-tight">
                Master CV Template: Build Your Foundation for AI Job Applications
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-ink-muted max-w-3xl mx-auto leading-relaxed">
                A Master CV is your complete, unedited work history: every role, skill, achievement,
                and qualification, structured in ATS-safe format. You upload it once to Useful Apply, and
                the system draws from it for every tailored application you generate. The quality of
                your Master CV directly determines the quality of every application that follows.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: What a Master CV Is (and Isn't) */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">Definition</p>
              <h2 className="text-3xl md:text-4xl font-bold text-brand mb-6">
                What a Master CV Is (and Isn&apos;t)
              </h2>
            </ScrollReveal>
            <p className="text-ink-body leading-relaxed mb-4">
              A Master CV is not your application CV. It is your complete professional record: every
              job, every project, every measurable result, every skill, certification, and language.
              It&apos;s intentionally longer and more comprehensive than anything you&apos;d send to
              an employer.
            </p>
            <p className="text-ink-body leading-relaxed mb-4">
              Its purpose is to be the source document from which tailored, role-specific CVs are
              derived. Think of it as your database; Useful Apply uses it to generate the right subset
              for each job.
            </p>
          </div>
        </section>

        {/* H2: Master CV Structure */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface-raised">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">Structure</p>
              <h2 className="text-3xl md:text-4xl font-bold text-brand mb-6">
                Master CV Structure (Copy This)
              </h2>
            </ScrollReveal>
            <p className="text-ink-body leading-relaxed mb-4">
              Use this section order: (1) Header: name, location, contact, portfolio/LinkedIn; (2)
              Professional summary: 3 to 5 lines, role, domain, 2 to 4 key areas; (3) Technical skills:
              categorized (programming languages, tools, platforms); (4) Soft skills: only include
              if supported by examples in work history.
            </p>
            <p className="text-ink-body leading-relaxed mb-4">
              (5) Work history: for each role, include employer, location, dates, job title, 4 to 10 bullet
              points, relevant projects; (6) Education: degree, institution, dates; (7)
              Certifications: title, issuer, year; (8) Languages: language and level (use
              consistent format: Native, C1, B2, etc.); (9) Optional: publications, open source,
              awards.
            </p>
          </div>
        </section>

        {/* H2: The Bullet Point Formula */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">Bullet Points</p>
              <h2 className="text-3xl md:text-4xl font-bold text-brand mb-6">
                The Bullet Point Formula for Work History
              </h2>
            </ScrollReveal>
            <p className="text-ink-body leading-relaxed mb-4">
              Each bullet follows this structure: Verb + Object + Context/Scope + Result. Examples:
              &quot;Built [System] for [Team], integrating [Tool], resulting in [Outcome].&quot;
              &quot;Owned [Process] across [Stakeholders], improving [Quality/Speed].&quot;
            </p>
            <p className="text-ink-body leading-relaxed mb-4">
              Results do not have to be numbers. A verifiable impact statement is sufficient
              (&quot;reduced manual steps&quot;, &quot;standardized reporting&quot;, &quot;improved
              handover time&quot;). Do not fabricate metrics. A bullet without a metric is always
              better than a bullet with an invented number.
            </p>
          </div>
        </section>

        {/* H2: ATS-Safe Formatting */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface-raised">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">Formatting</p>
              <h2 className="text-3xl md:text-4xl font-bold text-brand mb-6">
                ATS-Safe Formatting for the Master CV
              </h2>
            </ScrollReveal>
            <p className="text-ink-body leading-relaxed mb-4">
              Single-column layout. Standard section headings. Consistent date format (Month Year to
              Month Year). System fonts: Arial for body text, Georgia for headers. Standard bullet
              points only. No tables for critical content like job titles, dates, or skills. No
              text boxes, icons, or multi-column layouts.
            </p>
            <p className="text-ink-body leading-relaxed mb-4">
              The Master CV should be clean and functional, not designed. ATS parsing reliability is
              the goal, not visual impression.
            </p>
          </div>
        </section>

        {/* H2: Building It in 45-90 Minutes */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">Workflow</p>
              <h2 className="text-3xl md:text-4xl font-bold text-brand mb-6">
                Building It in 45 to 90 Minutes: The Workflow
              </h2>
            </ScrollReveal>
            <p className="text-ink-body leading-relaxed mb-4">
              Step 1: Create a blank document with fixed headings (Header, Summary, Skills, Work
              History, Education, Certifications, Languages). Step 2: Start with your most recent
              role. Write everything: raw, uncurated. Projects, responsibilities, tech stack,
              stakeholders, outcomes. Step 3: Convert each role into 6 to 12 bullet points using the
              Verb + Object + Context + Result format.
            </p>
            <p className="text-ink-body leading-relaxed mb-4">
              Step 4: Extract skills: anything appearing multiple times in work history goes into the
              Technical Skills section. Step 5: Add Education, Certifications, Languages. Step 6:
              Consistency pass: standardize job titles, company names, date format, tool names.
              45 to 90 minutes is realistic if you use existing sources: LinkedIn, old CVs, project
              lists, certificate documents.
            </p>
          </div>
        </section>

        {/* H2: Maintaining Your Master CV */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface-raised">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">Maintenance</p>
              <h2 className="text-3xl md:text-4xl font-bold text-brand mb-6">
                Maintaining Your Master CV Over Time
              </h2>
            </ScrollReveal>
            <p className="text-ink-body leading-relaxed mb-4">
              Update after every project completion. Add 2 to 3 bullet points while the details are
              fresh. Monthly review: add new certifications or skills. Maintain simple version
              control: date in the filename (e.g., MasterCV_Wasim_Feb2026.docx).
            </p>
            <p className="text-ink-body leading-relaxed mb-4">
              When you&apos;ve been applying heavily, keep a brief note of which job titles
              you&apos;ve targeted and which sections of work history you&apos;ve emphasized. This
              prevents inconsistency across applications to the same company over time.
            </p>
          </div>
        </section>

        {/* Internal Links */}
        <section className="py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-4">
            <Link
              href="/ai-job-application"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-accent-strong transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> AI Job Application Hub
            </Link>
            <Link
              href="/ai-job-application/zero-fabrication"
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent-strong hover:text-ink-accent transition-colors"
            >
              Zero-Fabrication: Why Source Quality Matters <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/ai-job-application/ats-optimization"
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent-strong hover:text-ink-accent transition-colors"
            >
              ATS Optimization: How Your CV Is Read <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <div className="text-center mb-10">
                <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">FAQ</p>
                <h2 className="text-3xl md:text-4xl font-bold text-brand">
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
                  className="bg-surface-raised rounded-xl border border-border p-6"
                >
                  <h3 itemProp="name" className="text-lg font-bold text-ink-body mb-3">
                    {faq.q}
                  </h3>
                  <div
                    itemScope
                    itemType="https://schema.org/Answer"
                    itemProp="acceptedAnswer"
                  >
                    <p itemProp="text" className="text-ink-muted leading-relaxed">
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
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-pill -translate-y-1/2 translate-x-1/2 animate-float-slow" />
          <ScrollReveal>
            <div className="max-w-4xl mx-auto text-center relative">
              <h2 className="text-3xl md:text-4xl font-bold text-ink-inverse mb-4">
                Upload Your Master CV to Useful Apply
              </h2>
              <p className="text-lg text-ink-inverse-muted mb-10 max-w-2xl mx-auto">
                Build your Master CV once, then generate tailored applications for every role in under
                90 seconds.
              </p>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-accent-ink font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-floating text-lg"
              >
                Upload Your Master CV to Useful Apply
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
