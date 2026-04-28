import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Zap, FileText, Mail, MailPlus, Target, Shield, Sparkles, Check, MessageSquareText, Compass, ClipboardList } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Features: Find Jobs and Apply Smarter with Karko AI',
  description:
    'Smart Job Feed delivers hand-picked jobs daily. AI generates tailored CVs, cover letters and emails. Built-in tracker keeps everything organized. Free to try.',
  canonical: '/features',
});

const features = [
  {
    icon: Compass,
    title: 'Smart Job Feed',
    description:
      'Tell Karko the roles, countries and cities you care about. Every morning, your top matches are waiting, ranked by fit against your CV. Save jobs you like, dismiss ones that miss, or apply with one click.',
    benefits: [
      'Daily delivery at your chosen hour',
      'Ranked by real fit against your CV, not keyword match',
      'Up to 15 jobs/day on Plus (~300/month)',
      'Up to 25 jobs/day on Max (~500/month)',
      'One-click "Apply with Karko" into the Application Kit',
    ],
    cost: 'Included with Plus and Max',
    link: '/dashboard',
    linkText: 'Try the Job Feed →',
    image: '/images/features/smart-job-feed.jpg',
  },
  {
    icon: Target,
    title: 'Fit Analysis (Analyze First Mode)',
    description:
      'Know if a job is worth applying to before spending credits. Our AI analyzes the job description against your Master CV and provides a match percentage, skill gaps, and strategic recommendations.',
    benefits: [
      'Saves time on bad matches',
      'Focuses your efforts on good fits',
      'Costs only 0.5 credits',
      'Provides actionable gap analysis',
    ],
    cost: '0.5 credits',
    link: '/ai-job-application/zero-fabrication',
    linkText: 'Learn about our anti-hallucination system →',
    image: '/images/features/fit-analysis.jpg',
  },
  {
    icon: FileText,
    title: 'AI CV Optimization',
    description:
      'Generate a tailored, ATS-optimized resume from your Master CV and any job description. Keywords are automatically extracted and applied where you have relevant experience.',
    benefits: [
      'ATS-safe by default (passes Workday, Greenhouse, Lever)',
      'Role-specific prioritization',
      'Keyword-rich without stuffing',
      'Choose from 6 professional templates',
    ],
    cost: 'Part of 2.0 credit package',
    link: '/ai-job-application/ats-optimization',
    linkText: 'See ATS optimization guide →',
    image: '/images/features/ai-cv-optimization.jpg',
  },
  {
    icon: Sparkles,
    title: 'Personalized Cover Letters',
    description:
      'Not generic "I am excited to apply" templates. Our AI researches the company, references specific details, and crafts a tailored narrative that highlights your relevant achievements.',
    benefits: [
      'Company-specific research included',
      'Opens with achievement, not cliché',
      'Consistent voice with your CV',
      '50%+ higher callback rate than templates',
    ],
    cost: 'Part of 2.0 credit package',
    link: '/blog/ai-cover-letter-generator-how-it-works',
    linkText: 'How AI cover letters work →',
    image: '/images/features/personalized-cover-letters.jpg',
  },
  {
    icon: MessageSquareText,
    title: 'AI Screening Question Answers',
    description:
      'Paste your screening questions from Workday, Greenhouse, Lever, or any ATS portal. Karko AI drafts concise, role-specific answers using your CV and the job description. Supports yes/no, behavioral (STAR format), situational, and free-text questions.',
    benefits: [
      'Answers up to 7 questions per session',
      'Compressed STAR format for behavioral questions',
      'Stays within ATS character limits (under 750 chars)',
      'Anti-hallucination: only references your real experience',
    ],
    cost: 'Max plan',
    link: '/ai-job-application/screening-question-answers',
    linkText: 'Learn about screening answers',
    image: '/images/features/screening-question-answers.jpg',
  },
  {
    icon: Mail,
    title: 'Application Email Generation',
    description:
      'Nobody else offers this. Professional emails to send with your CV and cover letter. Includes subject line, body copy, and attachment references. Sending application emails increases response rates by up to 40%.',
    benefits: [
      'Unique feature (only Karko AI offers this)',
      'Subject line + body + formatting',
      'References specific role and company',
      '40% higher response rate',
    ],
    cost: 'Part of 2.0 credit package',
    link: '/ai-job-application/90-second-application-package',
    linkText: 'See 90-second workflow →',
    image: '/images/features/application-email-generation.jpg',
  },
  {
    icon: MailPlus,
    title: 'Follow-Up Email Generation',
    description:
      'Most candidates never follow up. Get a professional follow-up email ready to send 7-10 days after applying. Polite, reinforces fit, and keeps you visible during the decision window.',
    benefits: [
      'Unique feature (only Karko AI offers this)',
      'Timed for optimal impact (7-10 days)',
      'Reinforces interest without being pushy',
      '40% increase in callback rate',
    ],
    cost: 'Part of 2.0 credit package',
    link: '/blog/follow-up-email-after-job-application',
    linkText: 'When to send follow-ups →',
    image: '/images/features/follow-up-email-generation.jpg',
  },
  {
    icon: ClipboardList,
    title: 'Application Tracker',
    description:
      'Every application you generate is stored with its match score, status, company and role. Update status as you progress through interviews. No more spreadsheet chaos.',
    benefits: [
      'Automatic tracking for all Karko applications',
      'Match score and fit analysis preserved',
      'Status updates (applied, interview, offer, rejected)',
      'Filter and search your application history',
    ],
    cost: 'Included in all plans',
    link: '/dashboard',
    linkText: 'See your tracker →',
    image: '/images/features/application-tracker.jpg',
  },
  {
    icon: Sparkles,
    title: 'Master CV System',
    description:
      'Upload your complete work history once. Store it as your single source of truth. Use it for every job application. No more rewriting experience for each role.',
    benefits: [
      'Upload once, use everywhere',
      'Structured format ensures consistency',
      'All claims traced to this document',
      'Free to store',
    ],
    cost: 'Free',
    link: '/master-cv-template',
    linkText: 'Build your Master CV →',
    image: '/images/features/master-cv-system.jpg',
  },
  {
    icon: Shield,
    title: 'ATS-First Templates',
    description:
      'All 6 professional templates are engineered to pass ATS parsers. Single-column layouts, standard section headings, system fonts, and consistent date formats. Compatible with Workday, Greenhouse, Lever, and all major ATS platforms.',
    benefits: [
      'Pass ATS by default (no manual checking)',
      '6 professional designs',
      'US and German templates included',
      'System fonts for maximum compatibility',
    ],
    cost: 'Included in all plans',
    link: '/ai-job-application/ats-optimization',
    linkText: 'ATS optimization guide →',
    image: '/images/features/ats-first-templates.jpg',
  },
  {
    icon: Zap,
    title: '90-Second Workflow',
    description:
      'Complete application package (CV, cover letter, application email, follow-up email) generated in under 90 seconds. One unified AI agent creates all materials with consistent voice.',
    benefits: [
      '100 applications in 2.5 hours vs 75 hours manually',
      '97% time savings',
      'Unified voice across all documents',
      'Context cached for speed',
    ],
    cost: '2.0 credits per application',
    link: '/ai-job-application/90-second-application-package',
    linkText: 'See workflow demo →',
    image: '/images/features/ninety-second-workflow.jpg',
  },
];

const planFeatures = [
  {
    feature: 'Price',
    free: '$0/mo',
    plus: '$19.99/mo',
    max: '$79.99/mo',
  },
  {
    feature: 'Applications/Month',
    free: '2',
    plus: '25',
    max: '100',
  },
  {
    feature: 'Credits/Month',
    free: '4',
    plus: '50',
    max: '200',
  },
  {
    feature: 'Complete Application Package',
    free: true,
    plus: true,
    max: true,
  },
  {
    feature: 'Fit Analysis',
    free: true,
    plus: true,
    max: true,
  },
  {
    feature: 'ATS-Optimized Templates',
    free: true,
    plus: true,
    max: true,
  },
  {
    feature: 'Anti-Hallucination Guardrails',
    free: true,
    plus: true,
    max: true,
  },
  {
    feature: 'Application Tracker',
    free: true,
    plus: 'Unlimited',
    max: 'Unlimited',
  },
  {
    feature: 'Smart Job Feed',
    free: false,
    plus: 'Up to 15/day',
    max: 'Up to 25/day',
  },
  {
    feature: 'Add-On Credit Packs',
    free: false,
    plus: true,
    max: true,
  },
  {
    feature: 'Screening Question Answers',
    free: false,
    plus: false,
    max: true,
  },
  {
    feature: 'Premium Dedicated Support',
    free: false,
    plus: false,
    max: true,
  },
];

const faqs = [
  {
    question: 'What makes Karko different from resume builders?',
    answer:
      'Most tools just build resumes. Karko AI generates complete application packages: CV, cover letter, AND personalized emails (application + follow-up). Nobody else offers email generation.',
  },
  {
    question: 'What is the difference between Free, Plus and Max?',
    answer:
      'Every plan includes the core application workflow: tailored CV, cover letter, application email, follow-up email, fit analysis, ATS templates and anti-hallucination guardrails. Plus adds higher volume, Smart Job Feed and add-on credit packs. Max adds the highest volume, screening question answers and premium dedicated support.',
  },
  {
    question: 'Can I buy more credits?',
    answer:
      'Yes, if you\'re on Plus or Max. You can purchase add-on credit packs ($19.99 for 50 credits, 25 applications). Purchased credits roll over as long as your subscription is active.',
  },
  {
    question: 'What AI model do you use?',
    answer:
      'Claude Sonnet 4.6 by Anthropic. It\'s the latest and most capable AI model for writing tasks. We use it via Amazon Bedrock with context caching for speed and consistency.',
  },
  {
    question: 'Are all templates ATS-safe?',
    answer:
      'Yes. All 6 templates are designed ATS-first: single-column layouts, standard section headings, system fonts (Arial/Georgia), and consistent date formats. They pass Workday, Greenhouse, Lever, and all major ATS platforms.',
  },
  {
    question: 'How does fit analysis work?',
    answer:
      'Upload your Master CV and paste a job description. Our AI extracts required skills, compares them to your experience, calculates a match percentage, identifies gaps, and recommends whether to apply. Costs 0.5 credits.',
  },
];

export default function FeaturesPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-cream-100">
      {/* FAQ JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <Navbar />
      <main>
        {/* Hero */}
        <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gold-50 rounded-full border border-gold-200 mb-6">
                <Sparkles className="w-4 h-4 text-gold-600" />
                <span className="text-sm font-semibold text-gold-700">All Features, All Plans</span>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="font-bold text-navy-600 text-[44px] sm:text-[52px] lg:text-[56px] leading-[1.05] tracking-tight mb-6">
                Features built for how you <span className="text-gold-500">actually apply.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-lg text-warm-gray max-w-3xl mx-auto leading-relaxed">
                Everything you need to apply smarter: fit analysis, AI-generated application materials, personalized emails, and ATS optimization. All powered by Claude Sonnet 4.6.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  Try it free, 2 applications, no credit card
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-8">
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <ScrollReveal key={i} delay={i * 100}>
                    <div className="bg-white rounded-2xl border border-cream-200 p-8 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-4 mb-6">
                        <div className="w-12 h-12 bg-gold-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Icon className="w-6 h-6 text-gold-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-navy-600 mb-2">{feature.title}</h3>
                          <div className="inline-block px-2 py-0.5 bg-cream-50 border border-cream-200 rounded text-xs font-medium text-charcoal">
                            {feature.cost}
                          </div>
                        </div>
                      </div>

                      <div className="relative mb-6 aspect-[16/9] overflow-hidden rounded-xl border border-cream-200 bg-cream-50">
                        <Image
                          src={feature.image}
                          alt={`${feature.title} illustration`}
                          fill
                          sizes="(min-width: 1024px) 560px, calc(100vw - 64px)"
                          className="object-cover"
                        />
                      </div>

                      <p className="text-warm-gray mb-6 leading-relaxed">{feature.description}</p>

                      <div className="space-y-2 mb-6">
                        {feature.benefits.map((benefit, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-charcoal">{benefit}</span>
                          </div>
                        ))}
                      </div>

                      <Link
                        href={feature.link}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-gold-600 transition-colors"
                      >
                        {feature.linkText}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-4">Core workflow on every plan.</h2>
              <p className="text-warm-gray max-w-2xl mx-auto">
                Start free with the complete application package. Upgrade when you need more monthly applications, Smart Job Feed automation, screening answers or premium support.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-cream-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cream-200 bg-cream-50">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-navy-700">Feature</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-navy-700">Free</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-navy-700">Plus</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-navy-700">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planFeatures.map((row, i) => (
                      <tr key={i} className="border-b border-cream-100 last:border-b-0">
                        <td className="px-6 py-4 text-sm text-charcoal font-medium">{row.feature}</td>
                        <td className="px-6 py-4 text-center">
                          {typeof row.free === 'boolean' ? (
                            row.free ? (
                              <Check className="w-5 h-5 text-green-600 mx-auto" />
                            ) : (
                              <span className="text-warm-gray">—</span>
                            )
                          ) : (
                            <span className="text-sm text-charcoal font-medium">{row.free}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {typeof row.plus === 'boolean' ? (
                            row.plus ? (
                              <Check className="w-5 h-5 text-green-600 mx-auto" />
                            ) : (
                              <span className="text-warm-gray">—</span>
                            )
                          ) : (
                            <span className="text-sm text-charcoal font-medium">{row.plus}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {typeof row.max === 'boolean' ? (
                            row.max ? (
                              <Check className="w-5 h-5 text-green-600 mx-auto" />
                            ) : (
                              <span className="text-warm-gray">—</span>
                            )
                          ) : (
                            <span className="text-sm text-charcoal font-medium">{row.max}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-center mt-8">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-6 py-3 bg-navy-600 hover:bg-navy-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                View pricing
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-bold text-navy-600 text-[32px] leading-[1.1] mb-10 text-center">Frequently asked questions.</h2>
            <div className="space-y-6">
              {faqs.map((faq, i) => (
                <ScrollReveal key={i} delay={i * 50}>
                  <div className="bg-white rounded-xl border border-cream-200 p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-navy-600 mb-3">{faq.question}</h3>
                    <p className="text-charcoal leading-relaxed">{faq.answer}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-navy-700 rounded-2xl p-10 text-white text-center">
              <h2 className="font-bold text-white text-[28px] md:text-[32px] leading-[1.1] mb-4">
                Your next interview is <span className="text-gold-400">90 seconds away.</span>
              </h2>
              <p className="text-navy-200 mb-6 leading-relaxed">
                2 complete application packages: CV, cover letter, application email and follow-up. No credit card required.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                Start free, no credit card
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
