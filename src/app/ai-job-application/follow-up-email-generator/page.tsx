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
    title: 'AI Follow-Up Email Generator — Increase Callbacks by 40%',
    description:
      'Generate professional follow-up emails after job applications with AI. Research shows follow-ups increase response rates by 40%. Try free.',
    canonical: '/ai-job-application/follow-up-email-generator',
  });
}

const faqs = [
  {
    q: 'When should I send a follow-up email after applying?',
    a: 'The standard timeline is 7 to 10 business days after submitting your application. Most companies aim to respond within 1 to 2 weeks. If you follow up too early (day 3), you\'re jumping the gun. If you wait too long (4+ weeks), the role might already be filled. If the job posting mentions a timeline, wait until that deadline passes, then add 2 to 3 business days.',
  },
  {
    q: 'Do follow-up emails actually work?',
    a: 'Yes. A 2023 TopResume study found that sending a follow-up email increases your chances of getting a response by 40%. Your application may have been lost in the recruiter\'s inbox (they receive 250+ applications per role on average). A follow-up brings you back to the top of the pile and signals genuine interest.',
  },
  {
    q: 'What should I include in a follow-up email?',
    a: 'Three things: (1) remind them who you are (role + application date), (2) briefly reiterate your fit (one key skill or achievement), and (3) make it easy to respond (ask a specific question or offer to provide more info). Keep it 100 to 150 words. Anything longer and you\'ve lost them.',
  },
  {
    q: 'How does an AI follow-up email generator work?',
    a: 'Karko AI generates a follow-up email as part of the complete application package (CV, cover letter, application email, follow-up email). It references the role, application date, and your top relevant achievement from your Master CV, using professional tone with no filler. You get the follow-up email upfront, so when day 7 to 10 rolls around, you already have it ready to send.',
  },
  {
    q: 'How many follow-ups should I send?',
    a: 'One follow-up is professional. Two follow-ups (spaced 7 to 10 days apart) is acceptable if you got no response. Three follow-ups is pushing it. More than three and you\'re burning bridges. If you haven\'t heard back after two follow-ups, move on.',
  },
];

export default function FollowUpEmailGeneratorPage() {
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
        name: 'Follow-Up Email Generator',
        item: `${SITE_URL}/ai-job-application/follow-up-email-generator`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'AI Follow-Up Email Generator: Increase Response Rates by 40%',
    description:
      'Learn how Karko AI generates professional follow-up emails after job applications. Follow-ups increase callbacks by 40%. Get yours in 90 seconds.',
    author: { '@type': 'Organization', name: 'KarKo AI', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'KarKo AI',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/karko-ai.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/follow-up-email-generator`,
    datePublished: '2026-03-15',
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
            <li className="text-navy-600 font-medium">Follow-Up Email Generator</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">AI Follow-Up Email Generator</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                AI Follow-Up Email Generator: Increase Response Rates by 40%
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                Following up after a job application increases your chances of getting a response
                by 40%. But most job seekers either skip the follow-up entirely or don&apos;t
                know what to write. Karko AI generates a professional follow-up email as part of
                your application package, so when day 7 to 10 rolls around, you already have it
                ready to send.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
                >
                  Get Your Follow-Up Email Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* H2: Why Follow-Ups Work */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The Data</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Why Follow-Up Emails Actually Work
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>A 2023 TopResume study found that sending a follow-up email increases your
              chances of getting a response by 40%.</strong> That&apos;s not a marginal edge.
              That&apos;s the difference between 2 interviews out of 100 applications and 3 or 4
              interviews.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Here&apos;s why it works: Recruiters receive 250+ applications per open role on
              average. Even if your CV is perfect, it might have been skimmed in 6 seconds during
              a Monday morning inbox triage. <strong>A follow-up brings you back to the top of
              the pile.</strong> It also signals genuine interest. Most candidates mass-apply and
              move on. A thoughtful follow-up tells the hiring manager you actually care about
              this specific role.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Timing is critical. If you follow up at the right moment (we&apos;ll cover when
              below), you catch the recruiter at the exact stage where they&apos;re reviewing
              shortlisted candidates or scheduling interviews. Perfect timing can turn a
              &quot;maybe&quot; into a &quot;yes.&quot;
            </p>
          </div>
        </section>

        {/* H2: When to Send */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Timing</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                When to Send a Follow-Up Email
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Timing is the difference between helpful persistence and being annoying.
            </p>
            <div className="bg-cream-50 border border-cream-200 rounded-xl p-6 mb-6">
              <p className="text-charcoal leading-relaxed mb-3">
                <strong>Standard timeline: 7 to 10 business days after submitting your
                application.</strong>
              </p>
              <p className="text-charcoal leading-relaxed mb-3">
                Why? Most companies aim to respond within 1 to 2 weeks. If you follow up on day
                3, you&apos;re jumping the gun. If you wait 4 weeks, the role might already be
                filled.
              </p>
              <p className="text-charcoal leading-relaxed mb-3">
                <strong>Exception 1:</strong> If the job posting mentions a timeline (&quot;We
                will respond within 3 weeks&quot;), wait until that deadline passes, then add 2
                to 3 business days.
              </p>
              <p className="text-charcoal leading-relaxed mb-3">
                <strong>Exception 2:</strong> If you applied through a personal referral or
                internal recruiter, you can follow up sooner, around 5 to 7 days, because
                there&apos;s already a connection.
              </p>
              <p className="text-charcoal leading-relaxed">
                <strong>Exception 3:</strong> If it&apos;s a high-urgency role (contract,
                seasonal, or &quot;immediate start&quot;), you can follow up after 5 days.
              </p>
            </div>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>One follow-up is professional. Two follow-ups (spaced 7 to 10 days apart)
              is acceptable if you got no response. Three follow-ups is pushing it.</strong> More
              than three and you&apos;re burning bridges.
            </p>
          </div>
        </section>

        {/* H2: What to Include */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Structure</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What to Include in Your Follow-Up Email
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              A good follow-up email does three things:
            </p>
            <div className="space-y-4 mb-6">
              <div className="bg-white border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">1. Reminds them who you are</h3>
                <p className="text-warm-gray leading-relaxed">
                  State the role and when you applied. Don&apos;t make them search their inbox.
                </p>
              </div>
              <div className="bg-white border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">2. Reiterates your interest and fit</h3>
                <p className="text-warm-gray leading-relaxed">
                  Briefly reinforce your fit with one key skill or achievement. Not a repeat of
                  your cover letter, just one relevant data point.
                </p>
              </div>
              <div className="bg-white border border-cream-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-charcoal mb-2">3. Makes it easy for them to respond</h3>
                <p className="text-warm-gray leading-relaxed">
                  Ask a specific question (&quot;Has there been any update on the hiring
                  timeline?&quot;) or offer to provide more information. Then thank them for
                  their time.
                </p>
              </div>
            </div>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Length: 100 to 150 words.</strong> Short enough to read in 30 seconds.
              Long enough to remind them why you&apos;re worth another look.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Tone:</strong> Professional but not desperate. Confident but not pushy.
              You&apos;re checking in, not begging.
            </p>
          </div>
        </section>

        {/* H2: How AI Generates Follow-Ups */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The AI Solution</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                How AI Generates Professional Follow-Up Emails in 90 Seconds
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Writing a follow-up email manually takes 10 to 15 minutes if you&apos;re trying to
              get the tone right. Most people procrastinate because they don&apos;t know how to
              phrase it without sounding pushy.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>Karko AI generates a professional follow-up email in under 90
              seconds.</strong> It&apos;s part of the 4-document package: CV, cover letter,
              application email, and follow-up email. All tailored to the same job description,
              all consistent in tone and claims.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The follow-up email includes:
            </p>
            <ul className="list-disc list-inside space-y-2 text-charcoal mb-4 pl-4">
              <li>The role and application date (pulled from your input)</li>
              <li>A brief reiteration of your top relevant skill or achievement (pulled from your Master CV)</li>
              <li>A polite request for an update or next steps</li>
              <li>Professional tone with no filler</li>
            </ul>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>You get the follow-up email when you first generate your application
              package.</strong> So when day 7 to 10 rolls around, you already have it ready to
              send. No staring at a blank screen. No overthinking the phrasing. Just open,
              review, and send.
            </p>
          </div>
        </section>

        {/* H2: Example Follow-Up */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Real Example</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                What an AI-Generated Follow-Up Email Looks Like
              </h2>
            </ScrollReveal>
            <div className="bg-white border-l-4 border-gold-500 rounded-xl p-8 shadow-sm">
              <p className="text-sm font-semibold text-charcoal mb-2">Subject:</p>
              <p className="text-charcoal mb-6">Following up: Senior Data Analyst application submitted March 15</p>

              <p className="text-sm font-semibold text-charcoal mb-2">Body:</p>
              <div className="space-y-3 text-charcoal leading-relaxed">
                <p>Hi [Hiring Manager&apos;s Name],</p>
                <p>
                  I applied for the Senior Data Analyst position on March 15 and wanted to follow
                  up to confirm that my application was received. I&apos;m very interested in
                  this role and believe my experience building predictive models for SaaS products
                  aligns well with the requirements outlined in the job description.
                </p>
                <p>
                  If there&apos;s any additional information I can provide to support my
                  application, I&apos;m happy to share it. I&apos;d also welcome the opportunity
                  to discuss how my background in Python and SQL optimization could contribute to
                  [Company Name]&apos;s data team.
                </p>
                <p>Thank you for your time, and I look forward to hearing from you.</p>
                <p>Best regards,<br />[Your Name]<br />[LinkedIn Profile or Portfolio Link]</p>
              </div>
            </div>
            <div className="mt-6 bg-cream-50 border border-cream-200 rounded-xl p-6">
              <p className="text-charcoal leading-relaxed mb-2">
                <strong>Why this works:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 text-charcoal pl-4">
                <li><strong>Reminds them:</strong> Role + date.</li>
                <li><strong>Reinforces fit:</strong> One specific skill match (predictive models, Python, SQL).</li>
                <li><strong>Opens the door:</strong> Offers to provide more info or discuss further.</li>
                <li><strong>Stays short:</strong> 120 words total.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* H2: The 40% Edge */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The Advantage</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                The 40% Edge: Follow-Ups Win Interviews
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              The job market in 2026 is brutal. You&apos;re competing with hundreds of other
              qualified candidates. Most of them submit an application and never follow up.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              <strong>A follow-up email is a 40% increase in response rate.</strong> That&apos;s
              massive. That&apos;s the difference between 2 interviews out of 100 applications
              and 3 or 4 interviews. Over time, that compounds.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              The candidates who get hired aren&apos;t always the most qualified. They&apos;re
              the ones who stayed visible, followed up at the right time, and made it easy for
              hiring managers to say yes.
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              With Karko AI, you get the follow-up email upfront. No procrastination. No
              overthinking. Just send it when the time is right.
            </p>
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
                Get Your Follow-Up Email in 90 Seconds
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                Try Karko AI free for your first 5 applications. Get a complete package:
                tailored CV, cover letter, application email, and follow-up email. No credit card
                required.
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
