import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

export const content: GeoContent = {
  title: "Try AI Job Applications Free",
  description:
    "Test Useful Apply's job application generator without signing up. Free plan includes 2 applications/month. See output quality before committing.",
  path: "/ai-job-application/free-no-signup-test",
  crumb: "Free No-Signup Test",
  published: "2026-02-24",
  modified: "2026-03-29",
  articleHeadline: "Test AI Job Application Free, No Sign-Up Required",
  articleDescription:
    "Test Useful Apply's job application generator without signing up. Free plan includes 2 applications free. See the output quality before committing to any plan.",
  hero: {
    eyebrow: "Try Free",
    title: "Test AI Job Application Free, No Sign-Up Required",
    lead:
      "You can generate job application documents with Useful Apply without signing up. The Free plan includes 2 applications per month with no credit card required. Paste a job description, see the fit score and generated package, and evaluate quality before deciding whether to create an account or upgrade.",
    cta: { label: "Start free", arrow: false },
  },
  sections: [
    {
      bg: "bg-surface",
      eyebrow: "No Commitment",
      heading: "What \"No Sign-Up\" Actually Means",
      reveal: true,
      body: body(
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          No sign-up means you can test the output quality without creating an account first.
          You paste a job description, upload your CV, and receive the complete package
          (tailored CV, cover letter, application email, follow-up email) to evaluate before
          committing any personal details or payment.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          The Free plan gives 2 full applications per month. An account becomes useful when you want to
          save your application history, reuse your Master CV across sessions, or generate more
          than 2 applications per month.
        </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Free Plan",
      heading: "What the Free Tier Includes",
      reveal: true,
      body: body(
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          2 complete applications per month, each generating all four documents (tailored CV, cover
          letter, application email, follow-up email). Credits reset monthly. The fit score
          analysis is included in each application.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4 max-w-3xl">
          The same AI quality (Claude Sonnet 5.5 by Anthropic) as paid tiers. No difference in
          output quality between free and paid. Only the volume limit changes.
        </p>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "Next Step",
      heading: "When to Create an Account",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          Three questions determine the right moment: (1) Does the output match your
          expectations? If the tailored CV and cover letter feel right for your specific role, an
          account is worth it. (2) Do you need to save and revisit previous applications?
          Application history is account-specific.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          (3) Need more than 2 applications a month? That&apos;s Plus or Max. Don&apos;t create an
          account until question one has a &quot;yes.&quot; That&apos;s the only honest
          sequence.
        </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Privacy",
      heading: "Data Minimization for the Trial",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          When testing without an account, use a job description plus a minimal skill summary
          rather than your full CV with personal details. You can evaluate output quality without
          uploading your home address, phone number, or internal project names.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          Add complete details once you&apos;ve confirmed the quality suits your needs. This is
          especially relevant for users in Germany and the EU, where data minimization is a good
          baseline practice regardless of the tool.
        </p>,
      ),
    },
  ],
  links: {
    bg: "bg-surface",
    items: [
      { href: "/ai-job-application/pricing-credits", label: "See Pricing & Credits" },
      { href: "/master-cv-template", label: "Build a Master CV first" },
    ],
  },
  faqs: [
    {
      q: 'Is there an AI job application tool I can try without signing up?',
      a: "Yes. Useful Apply's Free plan allows 2 complete applications per month (including tailored CV, cover letter, application email, and follow-up email) without creating an account or entering payment details.",
    },
    {
      q: 'Can I create job applications for free with AI?',
      a: "Yes. Useful Apply's Free plan gives 2 full applications per month at no cost. Each generates all four documents from a single job description. Paid plans (Plus at $19.99/month and Max at $79.99/month) increase the monthly volume.",
    },
    {
      q: 'How many free applications do I get?',
      a: '2 complete applications per month on the Free plan. Each application generates a tailored CV, cover letter, application email, and follow-up email from one job description.',
    },
    {
      q: "What's the difference between the free tier and paid plans?",
      a: 'Only volume. The Free plan gives 2 applications per month for free. Plus gives 25 applications for $19.99/month. Max gives 100 applications for $79.99/month. The AI quality, document types, and features are identical across all tiers.',
    },
    {
      q: 'Do I need to give my real CV to test the tool?',
      a: "No. For a first test, a summary of your skills and a couple of work history entries is enough to evaluate output quality. Once you're satisfied with the results, you can upload your complete CV for production use.",
    },
  ],
  faqSection: { bg: "", cardBg: "bg-surface-raised" },
  cta: {
    heading: "Start free",
    body:
      "2 complete applications at no cost. See the output quality before committing to anything.",
    button: { label: "Start free", arrow: false },
  },
};
