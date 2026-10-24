import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { SEO_SITE_URL } from '@/lib/seo/site-url';
import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

const SITE_URL = SEO_SITE_URL;

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

export const content: GeoContent = {
  title: "AI Job Application Guide",
  description:
    "AI job applications in one app: 90-second workflow, ATS optimization, zero-fabrication, integrations, pricing, and Master CV templates.",
  path: "/ai-job-application",
  crumb: "AI Job Application",
  hub: true,
  published: "2026-02-24",
  modified: "2026-03-29",
  articleHeadline: "AI Job Application: Tools, Workflow, ATS & Templates",
  articleDescription:
    "Everything about AI job applications in one app: 90-second workflow, ATS optimization, zero-fabrication, integrations, pricing, and Master CV templates.",
  hero: {
    eyebrow: "AI Job Application Hub",
    title: "AI Job Application: Tools, Workflow, ATS & Templates",
    lead:
      "An AI job application agent takes a single job description and generates a full application, tailored CV, cover letter, application email, and follow-up email, in under 90 seconds. The key to making it work is a reliable process: your real CV as the source of truth, ATS-compatible output, and a final review before you send.",
  },
  extraJsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'AI Job Application Topics',
      itemListElement: pillars.map((pillar, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: pillar.title,
        url: `${SITE_URL}${pillar.href}`,
      })),
    },
  ],
  sections: [
    {
      bg: "bg-surface",
      eyebrow: "Common Pitfalls",
      heading: "What Goes Wrong With AI Job Applications and How to Fix It",
      body: body(
        <div className="grid md:grid-cols-2 gap-8">
          <ScrollReveal delay={100}>
            <div className="bg-surface-raised rounded-card p-8 border border-border shadow-resting">
              <h3 className="text-lg font-bold text-ink-body mb-3">The Problem</h3>
              <p className="text-ink-muted leading-relaxed">
                Most AI applications fail not because of bad AI but because of wrong
                expectations. People copy text without matching it to the specific role,
                without clean source data, and without checking how ATS systems read the file.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <div className="bg-surface-raised rounded-card p-8 border border-border shadow-resting">
              <h3 className="text-lg font-bold text-ink-body mb-3">The Fix</h3>
              <p className="text-ink-muted leading-relaxed">
                (1) Understand the role, (2) use your own stable data as the base (Master CV),
                (3) output documents that ATS can process, (4) only automate where it genuinely
                saves time. When AI fabricates content, credibility collapses in the interview.
              </p>
            </div>
          </ScrollReveal>
        </div>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Your Complete Package",
      heading: "What Useful Apply Generates in 90 Seconds",
      reveal: true,
      body: body(
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          One input (job description), four outputs: tailored CV, cover letter, application
          email, and follow-up email. Every document references the same job description and draws
          from the same verified source, so they are consistent.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          The fit score tells you how well your background matches the role before documents are
          generated. Anti-hallucination safeguards mean no skills, metrics, or experience are
          fabricated.
        </p>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "Explore",
      heading: "The 10 Topics This Hub Covers",
      centered: true,
      body: body(
        <div className="grid sm:grid-cols-2 gap-5">
          {pillars.map((pillar, i) => (
            <ScrollReveal key={pillar.href} delay={i * 80}>
              <Link
                href={pillar.href}
                className="block bg-surface-raised rounded-card border border-border p-7 shadow-resting hover:shadow-elevated transition-shadow duration-(--duration-base) ease-standard h-full"
              >
                <h3 className="text-lg font-bold text-ink-body mb-2">{pillar.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed mb-4">
                  {pillar.description}
                </p>
                <span className="text-accent-strong text-sm font-semibold inline-flex items-center gap-1">
                  {pillar.linkText} <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </ScrollReveal>
          ))}
        </div>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Industry Trends",
      heading: "Recent Trends in AI Job Applications",
      reveal: true,
      body: body(
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          Recruiter tools and online application forms are the standard. Applications must not
          just read well but be technically submittable (upload, parsing, structure).
        </p>,
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          The trend is toward faster iteration: applicants test multiple versions rather than
          spending weeks on one perfect application. Trust is becoming more
          important. The more AI content circulates, the more consistency, verifiability, and
          zero-fabrication matter.
        </p>,
      ),
    },
  ],
  faqs: [
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
  ],
  faqSection: { bg: "bg-surface", cardBg: "bg-surface-raised" },
  cta: {
    heading: "Ready to Try AI Job Applications?",
    body:
      "Generate a full application in under 90 seconds. Free tier includes 2 applications free, no sign-up required.",
    actions: <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <Link
        href="/dashboard"
        className="px-10 py-4 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control transition-colors duration-(--duration-fast) ease-standard shadow-floating text-lg inline-flex items-center gap-2"
      >
        Start free
      </Link>
      <Link
        href="/pricing"
        className="px-10 py-4 border border-border-inverse-raised bg-ink-inverse/10 text-ink-inverse font-semibold rounded-control hover:bg-ink-inverse/20 transition-colors duration-(--duration-base) ease-standard text-lg"
      >
        View Pricing
      </Link>
    </div>,
  },
};
