import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

export const content: GeoContent = {
  title: "Zero-Fabrication AI Applications",
  description:
    "Useful Apply's anti-hallucination system verifies every CV claim against your source documents. No fabricated skills, metrics, or roles.",
  path: "/ai-job-application/zero-fabrication",
  crumb: "Zero-Fabrication",
  published: "2026-02-24",
  modified: "2026-03-29",
  articleHeadline: "Zero-Fabrication AI Job Application: No Invented Experience",
  articleDescription:
    "Useful Apply's anti-hallucination system ensures every CV claim is verified against your source documents. No fabricated skills, metrics, or roles, ever.",
  hero: {
    eyebrow: "Zero Fabrication",
    title: "Zero-Fabrication AI Job Application: No Invented Experience",
    lead:
      "Zero-fabrication means the AI can only generate claims that exist in your uploaded CV. Useful Apply enforces this structurally: before generating any document, the system extracts a verified list of skills and metrics from your source files, and every output is checked against that list. If a skill or achievement isn't in your CV, it doesn't appear in the application.",
    cta: { label: "Try Zero-Fabrication Applications Free", arrow: true },
  },
  sections: [
    {
      bg: "bg-surface",
      eyebrow: "Definition",
      heading: "What Zero-Fabrication Actually Means (and What It Doesn't)",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          Zero-fabrication is not a promise that AI output is always perfect. Generative models
          can still make formatting errors or emphasis mistakes. What it means specifically: the
          AI cannot invent new job titles, new employers, new time periods, new skills, or new
          metrics that don&apos;t exist in your source documents.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          &quot;Zero fabrication&quot; = zero new facts about you. The AI can reformulate,
          reorder, and emphasize, but it cannot create substance that doesn&apos;t already
          exist in your CV.
        </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Why It Matters",
      heading: "Why This Matters: What Happens When AI Fabricates",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          Fabricated experience creates a credibility problem the moment the application
          succeeds. An interview question about a project you didn&apos;t do, a background check
          that doesn&apos;t match, or a technical assessment for a skill the AI invented. These
          are the downstream consequences of fabricated applications.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          The short-term gain (sounding more qualified) creates long-term risk (a failed
          interview or rescinded offer). Zero-fabrication eliminates this risk category entirely.
        </p>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "The System",
      heading: "How Useful Apply's Anti-Hallucination System Works",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          Phase 1 of every workflow extracts two verified lists from your uploaded CV: verified
          skills and verified metrics (actual numbers from your source documents). These lists
          become binding constraints in Phase 2.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          The CV generation agent is explicitly forbidden from writing any skill not in the
          verified skills list, and any number not in the verified metrics list. A bullet point
          without a metric is always generated in preference to a bullet point with a fabricated
          number.
        </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Your Review",
      heading: "What You Still Need to Review",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          Zero-fabrication protects against invented content, but review is still necessary for:
          date accuracy (were dates transferred correctly from your CV?), role title consistency
          (does the tailored CV use your exact job titles?), and emphasis decisions (does the
          AI&apos;s prioritization of your experience reflect how you want to present yourself?).
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          AI handles speed and structure; you handle final judgment.
        </p>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "Global Context",
      heading: "Zero-Fabrication in Different Markets",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          In Germany and the EU, false claims in job applications can have legal consequences. In
          the US and UK, background checks are standard for professional roles.
          Zero-fabrication is therefore not just an ethical principle but a practical risk
          management approach regardless of which market you&apos;re applying in.
        </p>,
      ),
    },
  ],
  links: {
    bg: "",
    items: [
      { href: "/ai-job-application/ats-optimization", label: "How ATS Optimization Works" },
      { href: "/master-cv-template", label: "Build a Complete Master CV" },
    ],
  },
  faqs: [
    {
      q: "Which AI job application tool doesn't fabricate experience?",
      a: "Useful Apply's anti-hallucination system prevents fabricated experience by extracting a verified list of skills and metrics from your uploaded CV before generation and enforcing these as hard constraints. No skill, metric, or achievement can appear in the output unless it exists in your source documents.",
    },
    {
      q: 'Can AI guarantee zero invented experience in job applications?',
      a: 'No AI can provide an absolute guarantee, because generative models produce statistical outputs. What Useful Apply does is enforce structural constraints (a verified skills list and verified metrics list extracted from your CV) that make fabrication structurally difficult rather than just discouraged by prompt instructions.',
    },
    {
      q: 'What should I review in an AI-generated application?',
      a: 'Date accuracy, job title consistency, and emphasis decisions. Zero-fabrication protects against invented content, but the final judgment on how your experience is framed belongs to you. Plan 2–5 minutes of review per application before sending.',
    },
    {
      q: 'How does the verified metrics system work?',
      a: "During Phase 1 (before any documents are generated), Useful Apply extracts all numbers from your uploaded CV: revenue figures, team sizes, percentages, timeframes. These become a binding list. In Phase 2, the CV agent can only use numbers from this list. If a number does not exist in your source documents, it does not appear in the output, not even as an approximation.",
    },
    {
      q: 'Is fabricated AI experience detectable by recruiters?',
      a: 'Increasingly yes. Background checks, reference calls, technical assessments, and interview deep-dives are standard ways fabricated content is exposed. The risk increases at senior roles where experience claims are more heavily scrutinized.',
    },
  ],
  faqSection: { bg: "bg-surface", cardBg: "bg-surface-raised" },
  cta: {
    heading: "Generate Your Verified Application",
    body:
      "Every claim traced back to your CV. No fabricated skills, metrics, or experience.",
    button: { label: "Generate Your Verified Application", arrow: true },
  },
};
