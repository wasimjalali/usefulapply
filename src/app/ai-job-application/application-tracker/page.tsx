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
    title: 'Job Application Tracker: Track 100+ Applications',
    description:
      'Track job applications with status, match scores, and deadlines. Useful Apply automatically saves every application you generate. Stay organized throughout your job search.',
    canonical: '/ai-job-application/application-tracker',
  });
}

const faqs = [
  {
    q: 'Why do I need a job application tracker?',
    a: 'The average job seeker needs to submit 100+ applications to land one offer. Without a tracker, you lose track of which jobs you applied to, when you applied, which version of your CV you sent, and when to follow up. A tracker keeps you organized, reduces wasted effort (no duplicate applications), and helps you optimize your strategy by showing which types of roles or companies respond most often.',
  },
  {
    q: 'What should a good application tracker include?',
    a: 'Essential fields: company name, job title, application date, status (applied, interview, rejected, accepted), and a link to the job posting. Helpful additions: match score (how well your profile fits the role), follow-up deadlines, notes on recruiter conversations, and a copy of the CV/cover letter you sent (so you know what claims you made when the interview comes).',
  },
  {
    q: 'How does Useful Apply\'s tracker work?',
    a: 'Useful Apply automatically saves every application you generate to your tracker. It records the company, job title, application date, match score (fit assessment), and the exact documents you generated (CV, cover letter, email, follow-up). You can update the status (applied → interview → offer) and add notes. Everything is saved to your Supabase account, accessible from the Applications page.',
  },
  {
    q: 'Can I export my application data?',
    a: 'Yes. Your application data is stored in your Supabase account (PostgreSQL database). You can export it as CSV or JSON from the Supabase dashboard, or build custom queries if you need advanced analysis. Useful Apply does not lock you into a proprietary format.',
  },
  {
    q: 'What\'s the difference between a tracker and a CRM for job search?',
    a: 'A tracker is a simple log: what you applied to, when, and what happened. A CRM (Customer Relationship Management tool) is more complex, tracking relationships, conversations, and multi-stage pipelines. For most job seekers, a tracker is sufficient. If you\'re networking heavily or managing 20+ active conversations with recruiters, a CRM might help, but it\'s overkill for standard applications.',
  },
];

export default function ApplicationTrackerPage() {
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
        name: 'Application Tracker',
        item: `${SITE_URL}/ai-job-application/application-tracker`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Job Application Tracker: Stay Organized Through 100+ Applications',
    description:
      'Learn how Useful Apply\'s application tracker automatically saves your applications, match scores, and documents. Stay organized and never miss a follow-up.',
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/application-tracker`,
    datePublished: '2026-02-24',
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
            <li className="text-navy-600 font-medium">Application Tracker</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">Job Application Tracker</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                Job Application Tracker: Stay Organized Through 100+ Applications
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                The average job seeker submits 100+ applications to land one offer. Without a
                tracker, you lose track of which jobs you applied to, when to follow up, and
                which version of your CV you sent. Useful Apply automatically saves every application
                you generate, recording the company, role, match score, and documents, so you
                stay organized through your entire job search.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
                >
                  Start Tracking Applications Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: Why You Need a Tracker */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The Problem</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Why You Need a Job Application Tracker
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              In 2026, the average job seeker needs to submit <strong>100+ applications to land
              one offer.</strong> Some studies put that number at 200 or more, depending on the
              industry and role.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              At that volume, you can&apos;t rely on memory. You can&apos;t remember which
              companies you applied to 3 weeks ago. You can&apos;t remember when you&apos;re
              supposed to follow up. You can&apos;t remember which version of your CV you sent to
              which employer. And you definitely can&apos;t remember which claims you made in
              which cover letter when the interview finally comes 6 weeks later.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>A job application tracker solves this.</strong> It keeps a log of
              everything you&apos;ve applied to, when you applied, what happened, and what you
              sent. It helps you avoid duplicate applications (applying to the same role twice
              looks terrible). It reminds you when to follow up. And it gives you data on what
              works: which types of roles or companies respond most often.
            </p>
          </div>
        </section>

        {/* H2: What to Track */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Essential Fields</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What Should a Good Application Tracker Include?
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              A minimal tracker needs these fields:
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-cream-50 border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">Company Name</h3>
                <p className="text-warm-gray leading-relaxed">
                  So you know where you applied.
                </p>
              </div>
              <div className="bg-cream-50 border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">Job Title</h3>
                <p className="text-warm-gray leading-relaxed">
                  So you know which role (especially if applying to multiple roles at the same
                  company).
                </p>
              </div>
              <div className="bg-cream-50 border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">Application Date</h3>
                <p className="text-warm-gray leading-relaxed">
                  So you know when to follow up (7 to 10 business days later).
                </p>
              </div>
              <div className="bg-cream-50 border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">Status</h3>
                <p className="text-warm-gray leading-relaxed">
                  Applied, Interview, Rejected, Accepted, Follow-Up, so you know where each
                  application stands.
                </p>
              </div>
              <div className="bg-cream-50 border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">Job Posting Link</h3>
                <p className="text-warm-gray leading-relaxed">
                  So you can re-read the JD before the interview.
                </p>
              </div>
              <div className="bg-cream-50 border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">Documents Sent</h3>
                <p className="text-warm-gray leading-relaxed">
                  A copy of the CV and cover letter you sent, so you know what claims you made.
                </p>
              </div>
            </div>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Helpful additions:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 text-charcoal mb-4 pl-4">
              <li><strong>Match score:</strong> How well your profile fits the role (helps you prioritize follow-ups).</li>
              <li><strong>Follow-up deadline:</strong> Automatically calculated (application date + 7 to 10 days).</li>
              <li><strong>Notes:</strong> Recruiter name, conversation notes, next steps.</li>
              <li><strong>Source:</strong> Where you found the job (LinkedIn, Indeed, company website, referral).</li>
            </ul>
          </div>
        </section>

        {/* H2: How Useful Apply Tracker Works */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Automatic Tracking</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                How Useful Apply&apos;s Application Tracker Works
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Useful Apply automatically saves every application you generate.</strong> You
              don&apos;t have to manually log anything. The tracker is built into the workflow.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              When you generate an full application (CV, cover letter, email, follow-up), Useful Apply
              AI records:
            </p>
            <ul className="list-disc list-inside space-y-2 text-charcoal mb-4 pl-4">
              <li>Company name and job title (extracted from the job description)</li>
              <li>Application date (timestamp)</li>
              <li>Match score (the fit assessment from Phase 1)</li>
              <li>The exact documents you generated (CV, cover letter, email, follow-up)</li>
              <li>Status (defaults to &quot;Applied,&quot; you can update it later)</li>
            </ul>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Everything is saved to your Supabase account</strong> (PostgreSQL
              database). You can access your full application history from the Applications page
              in the Useful Apply dashboard. You can update the status (e.g., from &quot;Applied&quot; to
              &quot;Interview&quot;), add notes, and filter by status, date, or match score.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Follow-up reminders:</strong> The tracker shows you which applications are
              7 to 10 days old and haven&apos;t received a response, so you know when to send your
              follow-up email.
            </p>
          </div>
        </section>

        {/* H2: Why Automatic Beats Manual */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Efficiency</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Why Automatic Tracking Beats Manual Spreadsheets
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Many job seekers start with a Google Sheet or Excel file. They manually log each
              application: company, job title, date, status.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>This works until it doesn&apos;t.</strong> At 10 applications,
              it&apos;s manageable. At 50 applications, you start forgetting to update the
              spreadsheet. At 100 applications, the spreadsheet is out of sync with reality. You
              forget to log an application. You forget to update the status. You lose the link to
              the CV you sent.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Automatic tracking eliminates this friction.</strong> You don&apos;t have
              to remember to log anything. The tracker updates itself as part of the application
              generation workflow. You can&apos;t forget, because it&apos;s built in.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              And because Useful Apply saves the exact documents you generated, you can go back 6
              weeks later when the interview comes and review exactly what you said in your cover
              letter and which achievements you emphasized in your CV. That prep time is critical.
            </p>
          </div>
        </section>

        {/* H2: Data and Insights */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Optimization</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Using Your Tracker to Optimize Your Job Search Strategy
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              A tracker isn&apos;t just a log. It&apos;s data. And data lets you optimize.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              After 50 applications, you can start seeing patterns:
            </p>
            <ul className="list-disc list-inside space-y-2 text-charcoal mb-4 pl-4">
              <li><strong>Which types of roles respond most often?</strong> If you&apos;re getting interviews for &quot;Data Analyst&quot; but not &quot;Data Scientist,&quot; shift your applications accordingly.</li>
              <li><strong>Which companies respond fastest?</strong> Startups might respond in 3 days. Enterprises might take 3 weeks. Adjust your follow-up timing.</li>
              <li><strong>What match score threshold works?</strong> If you&apos;re getting interviews for 75%+ matches but not 60% matches, focus on higher-match roles.</li>
              <li><strong>Which application sources work best?</strong> LinkedIn Easy Apply might have a 2% response rate. Direct company websites might have 6%. Double down on what works.</li>
            </ul>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Most job seekers never do this analysis</strong> because they don&apos;t
              have clean data. Useful Apply&apos;s tracker gives you that data automatically.
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
                Start Tracking Your Applications Automatically
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                Try Useful Apply free for your first 2 applications. Every application you generate
                is automatically saved to your tracker. No manual logging. Stay organized from day
                one.
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
