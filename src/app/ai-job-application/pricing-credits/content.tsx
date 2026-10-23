import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

export const content: GeoContent = {
  title: "AI Application Pricing & Credits",
  description:
    "Useful Apply pricing: Free (2 apps/month), Plus $19.99/month (25 apps), Max $79.99/month (100 apps). Transparent credit-based pricing.",
  path: "/ai-job-application/pricing-credits",
  crumb: "Pricing & Credits",
  published: "2026-02-24",
  modified: "2026-03-29",
  articleHeadline: "AI Job Application Pricing & Credits: How Useful Apply Plans Work",
  articleDescription:
    "Useful Apply pricing: Free (2 applications), Plus $19.99/month (25 applications), Max $79.99/month (100 applications). Credit-based system with transparent cost per application.",
  hero: {
    eyebrow: "Pricing & Credits",
    title: "AI Job Application Pricing & Credits",
    lead:
      "Useful Apply uses a credit-based pricing model: each full application costs 2 credits. The Free plan gives 4 credits (2 applications) free. The Plus plan ($19.99/month) gives 50 credits (25 applications). The Max plan ($79.99/month) gives 200 credits (100 applications). All tiers generate the same four documents with no quality difference between plans.",
    cta: { label: "Start free", arrow: false },
  },
  sections: [
    {
      bg: "bg-cream-50",
      eyebrow: "Plans",
      heading: "The Three Plans Explained",
      reveal: true,
      body: body(
        <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
          Free: 4 credits, 2 complete applications per month, no credit card required. Good for
          evaluating output quality before committing. Plus ($19.99/month): 50
          credits, 25 complete applications per month. Good for active job searchers applying to
          5 to 10 roles per week.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
          Max ($79.99/month): 200 credits, 100 applications per month. Good for high-volume
          campaigns or career transitions with many active applications. All plans include the
          full document package, fit score, and anti-hallucination safeguards.
        </p>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "Credit System",
      heading: "How Credits Are Counted",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          One complete application (Check Fit or Generate Application) costs 2 credits. A fit
          assessment only (without generating documents) costs 0.5 credits. Regenerating a cover
          letter or email costs 0.5 credits per regeneration. The follow-up email is included in
          the initial 2-credit generation at no additional credit cost.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          Add-on credit packs are available if you exceed your monthly plan volume.
        </p>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "Cost Breakdown",
      heading: "Cost Per Application: The Right Way to Compare",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          The fair comparison metric is cost per full application, not cost per
          month. Plus plan: $19.99 ÷ 25 applications = ~$0.80 per full application
          (CV + cover letter + 2 emails). Max plan: $79.99 ÷ 100 applications = ~$0.80 per
          full application.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          Compare this to the time cost of manual applications: roughly an hour each, 25
          applications is around 25 hours of manual work.
        </p>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "Choosing a Plan",
      heading: "When to Choose Each Plan",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Start with the Free plan to validate output quality. Move to Plus if you are
          applying consistently and need more than 2 applications per month. Move to Max if you are in
          an intensive job search phase: layoff, career transition, or high-volume market.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          Use credit packs to cover occasional spikes without upgrading your plan permanently.
        </p>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "Transparency",
      heading: "What the Credit System Prevents",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Transparent credit counting makes cost predictable. Unlike tools that charge per
          &quot;AI interaction&quot; or have opaque token-based billing, Useful Apply charges per
          full application. One job description generates one complete set of four
          documents for 2 credits.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          You always know exactly what you&apos;re paying for.
        </p>,
      ),
    },
  ],
  links: {
    bg: "",
    items: [
      { href: "/ai-job-application/free-no-signup-test", label: "Free No-Signup Test" },
      { href: "/ai-job-application/90-second-application-package", label: "What the Package Includes" },
    ],
  },
  faqs: [
    {
      q: 'How much does Useful Apply cost?',
      a: 'Free: 2 applications/month at no cost. Plus: $19.99/month for 25 applications. Max: $79.99/month for 100 applications. All plans include the complete 4-document package (tailored CV, cover letter, application email, follow-up email).',
    },
    {
      q: 'How many applications does 2 credits cover?',
      a: 'One full application. Each package generates a tailored CV, cover letter, application email, and follow-up email from a single job description. 2 credits = 1 complete package regardless of which flow you use (Check Fit or Generate Application).',
    },
    {
      q: 'Is there a free plan with no credit card?',
      a: 'Yes. The Free plan gives 2 complete applications per month with no credit card required. The same AI quality as paid plans.',
    },
    {
      q: 'What happens if I run out of credits mid-month?',
      a: 'You can purchase additional credit packs without upgrading your monthly plan. Credit packs let you cover volume spikes without committing to a higher recurring price.',
    },
    {
      q: 'What is the cheapest plan for heavy job searching?',
      a: 'The Max plan at $79.99/month gives 100 applications, which works out to approximately $0.80 per full application. For context: one tailored application takes roughly an hour by hand. Useful Apply does it in 90 seconds, roughly 40x faster. On Max, 100 applications a month is close to 100 hours of manual work returned to you.',
    },
  ],
  faqSection: { bg: "bg-cream-50", cardBg: "bg-white" },
  cta: {
    heading: "Start free",
    body:
      "2 complete applications at no cost. No credit card required. Same AI quality as paid plans.",
    button: { label: "Start free", arrow: false },
  },
};
