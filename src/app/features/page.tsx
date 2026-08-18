import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Zap, FileText, Mail, MailPlus, Target, Shield, Sparkles, Check, MessageSquareText, Compass, ClipboardList } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Features: One app for your entire job search | Useful Apply',
  description:
    'Useful Apply is the AI job application agent that replaces the seven tools you use to apply for a job. Smart Job Feed, fit analysis, tailored CV, cover letter, emails, screening answers, and tracker. Every word traces back to your real CV.',
  canonical: '/features',
});

const features = [
  {
    icon: Sparkles,
    title: 'Primary CV',
    description:
      'Upload the CV you send to employers. Useful Apply reads it, structures every section, and keeps it as your source of truth. Every CV rewrite, cover letter, email, and screening answer Useful Apply generates pulls from this document. Nothing invented, nothing added.',
    benefits: [
      'Upload a PDF or paste plain text',
      'Parsed into structured sections you can edit inline',
      'Every output traces back to what is in here',
      'Free to store, across every plan',
    ],
    cost: 'Free',
    link: '/dashboard',
    linkText: 'Upload your CV',
    image: '/images/features/master-cv-system.jpg',
  },
  {
    icon: Compass,
    title: 'Smart Job Feed',
    description:
      'Most people start their search by bouncing between LinkedIn, Indeed, and company career pages. That is ten hours a week you do not need to spend. Useful Apply delivers up to 25 roles every morning, matched to your CV, your goals, and your location. Tap any card to start your application.',
    benefits: [
      'Delivered every morning at your chosen hour',
      'Ranked by real fit against your CV, not keyword match',
      'Up to 25 roles a day on Plus and Max',
      'Save roles, dismiss misses, or apply with one click',
    ],
    cost: 'Included with Plus and Max',
    link: '/dashboard',
    linkText: 'Try the Smart Job Feed',
    image: '/images/features/smart-job-feed.jpg',
  },
  {
    icon: Target,
    title: 'Fit Analysis',
    description:
      'Before you write a single word, see where you stand. Useful Apply reads the job description against your CV and gives you a match score, the skills that line up, and the gaps. You decide whether to apply before spending credits on the full application.',
    benefits: [
      'Match score with strengths and gaps',
      'Clear recommendation on whether to apply',
      'A checkpoint, not a commitment',
      'Costs only 0.5 credits',
    ],
    cost: '0.5 credits',
    link: '/ai-job-application/zero-fabrication',
    linkText: 'How the fit score works',
    image: '/images/features/fit-analysis.jpg',
  },
  {
    icon: FileText,
    title: 'Tailored CV',
    description:
      'Useful Apply rewrites your CV for this exact role. The facts do not change. The framing does. The most relevant experience gets more weight. Role-specific keywords land where you already have real experience. No invented skills, no filler, no stuffing.',
    benefits: [
      'Rewritten per role, never a one-size-fits-all CV',
      'Keywords placed where you have real experience',
      'Editable inline if anything needs a human touch',
      'Every line traces back to your real CV',
    ],
    cost: 'Part of 2.0 credit application',
    link: '/ai-job-application/ats-optimization',
    linkText: 'See how ATS optimization works',
    image: '/images/features/ai-cv-optimization.jpg',
  },
  {
    icon: Shield,
    title: 'ATS-Optimized Templates',
    description:
      'Six professional templates, all built to pass the systems every recruiter uses. Single-column layouts, standard section headings, system fonts, and consistent date formats. Compatible with Workday, Greenhouse, Lever, and every major ATS.',
    benefits: [
      'Six professional designs, US and German included',
      'Single-column, ATS-parseable by default',
      'System fonts (Arial and Georgia) for maximum compatibility',
      'Clean output that reads well for humans too',
    ],
    cost: 'Included in all plans',
    link: '/ai-job-application/ats-optimization',
    linkText: 'ATS optimization guide',
    image: '/images/features/ats-first-templates.jpg',
  },
  {
    icon: Sparkles,
    title: 'Tailored Cover Letter',
    description:
      'Not the generic "I am excited to apply" template everyone else sends. Useful Apply opens with a relevant achievement from your real CV, references the company, and writes in a voice that matches yours, not ChatGPT. Reads like an application, not a form letter.',
    benefits: [
      'Opens with a real achievement, not a cliché',
      'References the company and role specifically',
      'Consistent voice with your CV',
      'Editable inline for any final touch-ups',
    ],
    cost: 'Part of 2.0 credit application',
    link: '/blog/ai-cover-letter-generator-how-it-works',
    linkText: 'How AI cover letters work',
    image: '/images/features/personalized-cover-letters.jpg',
  },
  {
    icon: Mail,
    title: 'Application Email',
    description:
      'A professional email to send with your CV and cover letter attached. Subject line, body, and a clear reference to the role. Most tools skip this entirely. Useful Apply writes it for you, ready to copy into the portal or your email client.',
    benefits: [
      'Subject line, body, and formatting',
      'References the specific role and company',
      'Ready to paste into any portal or email client',
      'Writing that does not sound like AI',
    ],
    cost: 'Part of 2.0 credit application',
    link: '/ai-job-application/90-second-application-package',
    linkText: 'See the 90-second workflow',
    image: '/images/features/application-email-generation.jpg',
  },
  {
    icon: MailPlus,
    title: 'Follow-Up Email',
    description:
      'Most candidates never follow up. Useful Apply drafts one for you, ready to send 7 to 10 days after applying. Polite, reinforces why you are a fit, and keeps you visible during the decision window. Another thing the other tools do not do.',
    benefits: [
      'Pre-drafted for the 7-to-10-day window',
      'Reinforces fit without sounding pushy',
      'Saved on your tracker next to the original application',
      'Editable inline before you send',
    ],
    cost: 'Part of 2.0 credit application',
    link: '/blog/follow-up-email-after-job-application',
    linkText: 'When to send follow-ups',
    image: '/images/features/follow-up-email-generation.jpg',
  },
  {
    icon: MessageSquareText,
    title: 'Screening Question Answers',
    description:
      'Screening questions are where most applications die. Useful Apply reads your CV and drafts an answer for every question. Behavioral questions get a STAR structure. Factual questions get a direct answer. You keep control, you review, you submit. What used to take 20 minutes now takes two.',
    benefits: [
      'STAR structure for behavioral questions',
      'Direct answers for factual questions',
      'Stays within ATS character limits',
      'Every answer built from your real CV',
    ],
    cost: 'Included on Plus and Max',
    link: '/ai-job-application/screening-question-answers',
    linkText: 'Learn about screening answers',
    image: '/images/features/screening-question-answers.jpg',
  },
  {
    icon: ClipboardList,
    title: 'Application Tracker',
    description:
      'Every application you generate saves to your tracker automatically. Company, role, match score, status, date, and a ready follow-up. Update the status as things move. No more spreadsheet chaos, no more "which company was that one again?"',
    benefits: [
      'Automatic save for every application you generate',
      'Match score, status, and date on one row',
      'Status updates (applied, interview, offer, rejected)',
      'Filter and search across your whole history',
    ],
    cost: 'Included in all plans',
    link: '/dashboard',
    linkText: 'See your tracker',
    image: '/images/features/application-tracker.jpg',
  },
  {
    icon: Zap,
    title: '90-Second Application',
    description:
      'One tailored application takes roughly an hour by hand. Useful Apply does it in 90 seconds. CV, cover letter, application email, follow-up, and screening answers, all generated together with a consistent voice. Roughly 40x faster, without dropping quality.',
    benefits: [
      'CV, cover letter, email, follow-up, screening answers in one flow',
      'Consistent voice across every document',
      'Under two minutes per application',
      'Roughly 40x faster than manual tailoring',
    ],
    cost: '2.0 credits per application',
    link: '/ai-job-application/90-second-application-package',
    linkText: 'See the workflow',
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
    feature: 'Full application in 90 seconds',
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
    feature: 'Every word traces back to your CV',
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
    free: '5/day',
    plus: 'Up to 25/day',
    max: 'Up to 25/day',
  },
  {
    feature: 'Job Feed Search Breadth',
    free: false,
    plus: '2 job titles, 2 countries',
    max: '4 job titles, 4 countries',
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
    plus: true,
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
    question: 'Why Useful Apply is not a resume builder.',
    answer:
      'Resume builders help you format one CV. Useful Apply runs your entire job search. The Smart Job Feed finds the roles. Fit Analysis tells you if the role is worth applying to. The generator writes the CV, cover letter, application email, follow-up, and screening answers tailored to each role. The tracker keeps the list. It replaces seven separate tools with one loop.',
  },
  {
    question: 'Why Useful Apply is not an auto-apply bot.',
    answer:
      'Auto-apply bots blast hundreds of generic applications. Recruiters spot them, ATS systems flag them, and candidates get embarrassed in interviews. Useful Apply does the opposite: fewer applications, all tailored to the real role, all traceable to your real experience. You stay in control of what gets sent.',
  },
  {
    question: 'How does Useful Apply keep its output honest?',
    answer:
      'Every CV rewrite, cover letter, email, and screening answer is built from the CV you upload. Useful Apply will not invent job titles, skills, or experience you do not have. The job description is used for keyword alignment and tone, never as a source of facts about you. This is the one rule the product refuses to break.',
  },
  {
    question: 'What is the difference between Free, Plus and Max?',
    answer:
      'Free gets the core workflow: tailored CV, cover letter, application email, follow-up, fit analysis, ATS templates, the application tracker and a Smart Job Feed of the top 5 roles a day. Plus and Max add screening question answers, add-on credit packs and a larger feed at up to 25 roles a day. Max searches wider, 4 job titles across 4 countries against Plus at 2 and 2, and adds premium dedicated support. The main difference between plans is how many applications you can generate each month.',
  },
  {
    question: 'How does fit analysis work?',
    answer:
      'Paste any job description. Useful Apply reads it against your CV and gives you a match score, the skills that line up, and the gaps. You see where you stand before spending credits on the full application. If the score is strong, you generate the kit. If it is weak, the gaps tell you whether the role is wrong for you or your CV is just not surfacing the right experience.',
  },
  {
    question: 'Can I buy more credits?',
    answer:
      'Yes, on Plus or Max. Add-on credit packs are $19.99 for 50 credits (25 more applications). Credits from add-on packs roll over as long as your subscription is active. Free tier credits reset monthly.',
  },
  {
    question: 'Are all templates ATS-safe?',
    answer:
      'Yes. All six templates are built ATS-first: single-column layouts, standard section headings, system fonts (Arial and Georgia), and consistent date formats. They pass Workday, Greenhouse, Lever, and every major ATS platform.',
  },
  {
    question: 'What AI model powers Useful Apply?',
    answer:
      'Useful Apply runs on Claude Sonnet 4.6 by Anthropic, one of the most capable models available for writing. Most competitors use cheaper open-source models. We pay for the better model because the output has to survive both an ATS scan and a recruiter’s read. The workflow around the model is tuned specifically for job applications.',
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
                <span className="text-sm font-semibold text-gold-700">Seven tools, one loop</span>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="font-bold text-navy-600 text-[44px] sm:text-[52px] lg:text-[56px] leading-[1.05] tracking-tight mb-6">
                Everything you use to apply for a job, <span className="text-gold-500">in one app.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-lg text-warm-gray max-w-3xl mx-auto leading-relaxed">
                Job board, resume builder, ATS checker, cover letter AI, email drafter, screening helper, tracker. Useful Apply replaces all of them with one flow. Every word traces back to your real CV. Nothing invented.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  Start free, no credit card
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
              <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-4">Every plan, every feature. Pick your volume.</h2>
              <p className="text-warm-gray max-w-2xl mx-auto">
                Start free with the full workflow and a top-5 daily feed. Upgrade when you want more monthly applications, a larger feed or screening answers on top.
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
                              <span className="text-warm-gray">-</span>
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
                              <span className="text-warm-gray">-</span>
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
                              <span className="text-warm-gray">-</span>
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
                Upload your CV. Pick a role from your feed. Send your first full application before your coffee gets cold.
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
