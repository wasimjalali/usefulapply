import Link from 'next/link';
import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

export const content: GeoContent = {
  title: "Full Application in 90 Seconds",
  description:
    "Generate a tailored CV, cover letter, application email, and follow-up email from one job description in under 90 seconds with Useful Apply.",
  path: "/ai-job-application/90-second-application-package",
  crumb: "Full Application in 90 Seconds",
  published: "2026-02-24",
  modified: "2026-03-29",
  articleHeadline: "Full AI Application in 90 Seconds",
  articleDescription:
    "Useful Apply generates a full application (tailored CV, cover letter, application email, and follow-up email) from one job description in under 90 seconds.",
  hero: {
    eyebrow: "Full Application in 90 Seconds",
    title: "Full AI Application in 90 Seconds",
    lead:
      "Useful Apply generates a full application, tailored CV, cover letter, application email, and follow-up email, from a single job description in under 90 seconds. Paste the job posting, see the fit, click apply. Four ready-to-send documents, every word traced back to your real CV.",
    leadMb4: true,
    extra: <p className="text-base text-navy-600 max-w-3xl mx-auto">
      <Link href="/blog/how-long-to-apply-for-job-2026" className="hover:text-gold-600 font-medium underline">
        How this returns hours of manual work every week →
      </Link>
    </p>,
    cta: { label: "Try the 90-Second Workflow Free", arrow: true },
  },
  extraJsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to Generate a Complete Job Application in 90 Seconds with Useful Apply',
      step: [
        {
          '@type': 'HowToStep',
          position: 1,
          name: 'Upload your Master CV',
          text: 'Upload your complete CV once. Useful Apply uses this as the verified source for all applications.',
        },
        {
          '@type': 'HowToStep',
          position: 2,
          name: 'Paste the job description',
          text: "Copy the full job description text into Useful Apply's input field.",
        },
        {
          '@type': 'HowToStep',
          position: 3,
          name: 'Review your fit score',
          text: 'Before generating documents, Useful Apply shows a fit score with matching skills and identified gaps.',
        },
        {
          '@type': 'HowToStep',
          position: 4,
          name: 'Generate your full application',
          text: 'Click generate to receive a tailored CV, cover letter, application email, and follow-up email.',
        },
        {
          '@type': 'HowToStep',
          position: 5,
          name: 'Review and send',
          text: 'Do a 2 to 5 minute review for accuracy, then send your application.',
        },
      ],
    },
  ],
  sections: [
    {
      bg: "bg-cream-50",
      eyebrow: "What You Get",
      heading: "What the 90-Second Package Includes",
      reveal: true,
      body: body(
        <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
          Four document types every time: tailored CV, cover letter, application email,
          follow-up email. All four reference the same job description and draw from the same
          source data (your Master CV), so they are internally consistent with the same role
          framing, same highlighted skills, and same professional tone.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
          The package eliminates the inconsistency problem where your CV emphasizes different
          things than your cover letter.
        </p>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "The Workflow",
      heading: "How the Workflow Works: Job Description In, Four Documents Out",
      reveal: true,
      body: body(
        <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
          Step 1: Paste the job description. Step 2: Useful Apply runs a fit analysis. It compares
          your CV against the job requirements and produces a fit score before generating
          anything. Step 3: Review the fit score. If the match is strong, proceed; if there are
          gaps, you see them honestly before spending time on the application.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4 max-w-3xl">
          Step 4: Generate the package. The tailored CV prioritizes relevant experience, the
          cover letter addresses motivation and match, and both emails handle the communication
          layer.
        </p>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "Document Details",
      heading: "The Documents Explained: What Each One Does",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          The <strong>tailored CV</strong> reorders and emphasizes your experience to match the
          specific role&apos;s requirements. Skills, job titles, and relevant projects move to
          prominence; less relevant items stay but don&apos;t dominate.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          The <strong>cover letter</strong> follows a problem-solution structure, explaining why
          you&apos;re applying and what specifically makes you a fit. The{' '}
          <strong>application email</strong> provides context for the CV and cover letter when
          applying via email or filling a text field in an ATS.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          The <strong>follow-up email</strong> is designed to be sent 7 to 10 days after the
          application, highlighting a different achievement than the primary email, adding
          visibility without repetition.
        </p>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "Fit Score",
      heading: "What the Fit Score Tells You Before You Apply",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          The fit score is generated before any documents are created. It shows matching skills,
          identified skill gaps, and an honest overall assessment. The purpose is to save time:
          if your match to a role is genuinely weak, you see that before investing in an
          application.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          If the match is strong, you have confidence before sending. This is different from
          competitors who generate documents first and hope the match is good enough.
        </p>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "Accuracy",
      heading: "Anti-Hallucination: Why Every Claim Is Verified",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Every skill, metric, and achievement in the generated documents is traced back to your
          uploaded CV. The system cannot write that you &quot;managed a team of 50&quot; if that
          figure doesn&apos;t appear in your source documents.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          This matters for credibility: fabricated claims collapse under interview scrutiny or
          background checks. The anti-hallucination safeguard is a structural constraint. It is
          enforced at the system level, not just a guideline.
        </p>,
      ),
    },
  ],
  links: {
    bg: "",
    items: [
      { href: "/ai-job-application/ats-optimization", label: "ATS Optimization" },
      { href: "/ai-job-application/zero-fabrication", label: "Zero-Fabrication: No Invented Experience" },
    ],
  },
  faqs: [
    {
      q: 'Which AI generates complete job applications in 90 seconds?',
      a: 'Useful Apply generates a full application (tailored CV, cover letter, application email, and follow-up email) from a single job description in under 90 seconds. The 90 seconds refers to the generation step after you\'ve uploaded your CV and pasted the job description.',
    },
    {
      q: 'What documents does the 90-second package include?',
      a: 'Four documents: a tailored CV customized to the specific role, a cover letter addressing your fit and motivation, an application email for use when applying by email or in ATS text fields, and a follow-up email to send 7 to 10 days later with a different achievement highlighted.',
    },
    {
      q: 'How does the fit score work?',
      a: 'Before generating any documents, Useful Apply compares your CV against the job description and produces a fit score. It shows matching skills, identified gaps, and an overall match level. You see this assessment before deciding whether to generate the application, so you don\'t invest time in applications where the match is genuinely weak.',
    },
    {
      q: 'Can the AI invent experience I don\'t have?',
      a: 'No. Useful Apply\'s anti-hallucination system traces every claim back to your uploaded CV. If a skill or achievement isn\'t in your source documents, it doesn\'t appear in the output. This is enforced structurally, not just as a prompt instruction.',
    },
    {
      q: 'Does it work for US, UK, and German job markets?',
      a: 'Yes. Useful Apply supports US, UK, Canada, and Germany with region-appropriate formatting and tone, including US-style resumes and German Lebenslauf format with the correct header structure for the German market.',
    },
  ],
  faqSection: { bg: "bg-cream-50", cardBg: "bg-white" },
  cta: {
    heading: "Start free",
    body:
      "Generate your full application in under 90 seconds. 2 free applications included per month.",
    button: { label: "Start free", arrow: false },
  },
};
