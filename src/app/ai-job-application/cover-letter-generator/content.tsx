import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

// Body JSX keeps its original indentation on purpose: the compiler keeps trailing
// whitespace after a closing entity here, so re-indenting changes the rendered HTML.
export const content: GeoContent = {
  title: "AI Cover Letter Generator, Tailored in 90 Seconds",
  description:
    "Generate a tailored, ATS-optimized cover letter with AI. Built from your real CV, grounded in the specific role. No templates, no fabrication. Try free.",
  path: "/ai-job-application/cover-letter-generator",
  crumb: "Cover Letter Generator",
  published: "2026-03-25",
  modified: "2026-03-30",
  articleHeadline: "AI Cover Letter Generator: Tailored in 90 Seconds, No Templates",
  articleDescription:
    "How Useful Apply generates a tailored, ATS-optimized cover letter from your real CV. No fabrication, no generic templates, every word traces back to your experience.",
  hero: {
    eyebrow: "AI Cover Letter Generator",
    title: "AI Cover Letter Generator: Personalized in 90 Seconds, No Templates",
    lead:
      "An AI cover letter generator analyzes the job description, maps your relevant experience from your CV, and writes a personalized cover letter that demonstrates your fit for the role. Useful Apply generates cover letters in 90 seconds with anti-hallucination safeguards, meaning every claim traces back to your uploaded CV with no fabricated experience.",
    cta: { label: "Generate Your Cover Letter Free", arrow: true },
  },
  sections: [
    {
      bg: "bg-surface",
      eyebrow: "The Problem with Templates",
      heading: "Why Generic Cover Letter Templates Don't Work",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
              Generic cover letter templates start with &quot;Dear Hiring Manager, I am writing
              to express my interest in the [Job Title] position at [Company Name].&quot;
              Recruiters see this opening 200 times per role. It signals you didn&apos;t put in
              any effort.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              <strong>A cover letter that reads as written for this role beats one that could
              have been sent to any company.</strong> The difference isn&apos;t length or writing
              quality. It&apos;s relevance. A tailored cover letter references specific job
              requirements, your specific achievements, and the specific company context. A
              template does none of that.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              The problem is that writing a personalized cover letter manually takes 15 to 20
              minutes per job. If you&apos;re applying to 100 jobs, that&apos;s 33 hours of
              writing. Most job seekers can&apos;t sustain that, so they either use templates
              (low callback rate) or apply to fewer jobs (not enough volume to get results).
            </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "The AI Solution",
      heading: "How AI Generates Personalized Cover Letters in 90 Seconds",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
              An AI cover letter generator does three things: (1) analyzes the job description
              to extract key requirements and company context, (2) maps those requirements to
              your real experience from your uploaded CV, and (3) writes a personalized cover
              letter that explains your fit using natural language and professional tone.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              <strong>Useful Apply generates cover letters as part of a full application
              package:</strong> tailored CV, cover letter, application email, and follow-up
              email. All four documents reference the same job description and draw from the same
              verified source (your Master CV), so they&apos;re consistent in tone, claims, and
              emphasis.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              The cover letter opens with a specific achievement (not a cliché), references the
              exact job requirements, explains why you&apos;re interested in this company, and
              closes with a forward-looking statement. Length: 250 to 350 words. Time to
              generate: 90 seconds.
            </p>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "Zero Fabrication",
      heading: "Anti-Hallucination: No Invented Experience",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
              The biggest risk with AI writing tools is fabrication. Many AI tools see a job
              requirement for &quot;AWS&quot; and write &quot;I have extensive AWS
              experience&quot; even if your CV never mentions AWS. This backfires in the
              interview when you can&apos;t answer basic AWS questions.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              <strong>Useful Apply enforces strict traceability.</strong> Every skill, metric, and
              claim in the cover letter must map back to your uploaded CV. If you don&apos;t have
              AWS experience, the cover letter won&apos;t mention AWS. If your CV says you
              &quot;improved query performance by 40%,&quot; the cover letter can reference that
              exact metric. If your CV doesn&apos;t have a metric, the cover letter won&apos;t
              invent one.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              This is enforced structurally: the AI agent is explicitly forbidden from inventing
              skills, roles, or achievements. If it tries to fabricate, the output is rejected
              and regenerated. This safeguard is what separates AI-assisted writing from
              AI-generated lies.
            </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Quality Output",
      heading: "What a Good AI-Generated Cover Letter Looks Like",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
              A well-structured AI cover letter follows this pattern:
            </p>,
        <div className="bg-surface border border-border rounded-card p-6 mb-6">
              <p className="text-ink-body leading-relaxed mb-3">
                <strong>Paragraph 1: Strong opening.</strong> Open with a specific achievement
                or reason you&apos;re interested in this role. Not &quot;I am writing to express
                my interest.&quot;
              </p>
              <p className="text-ink-body leading-relaxed mb-3">
                <strong>Paragraph 2: Fit and relevance.</strong> Explain how your experience
                aligns with the role&apos;s top 2 to 3 requirements. Use specific examples from
                your CV.
              </p>
              <p className="text-ink-body leading-relaxed mb-3">
                <strong>Paragraph 3: Company-specific interest.</strong> Reference something
                specific about the company (mission, product, recent news) that shows you&apos;ve
                done research.
              </p>
              <p className="text-ink-body leading-relaxed">
                <strong>Paragraph 4: Closing.</strong> Brief, confident, forward-looking. Thank
                them for their time and express interest in discussing further.
              </p>
            </div>,
        <p className="text-ink-body leading-relaxed mb-4">
              Useful Apply generates cover letters following this structure automatically. The tone
              is professional but not robotic, confident but not arrogant, specific but not
              verbose. The output reads like a human wrote it, because the AI is trained on
              high-quality, real-world cover letters, not generic templates.
            </p>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "The Math",
      heading: "Why Speed Matters: Volume + Quality",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
              Writing 100 cover letters manually takes 33 hours (20 minutes per letter). Most job
              seekers don&apos;t have 33 hours, so they either (1) send generic templates and get
              a 2% callback rate, or (2) hand-write 10 letters and don&apos;t apply to enough
              jobs to get results.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              <strong>Useful Apply does it in 90 seconds per role.</strong> Same quality as a hand-written
              letter, 40 times faster. That unlocks the real win: apply to every relevant role with
              a cover letter that is actually tailored, not just the handful you have time to write
              by hand.
            </p>,
        <p className="text-ink-body leading-relaxed mb-4">
              A cover letter that reads as written for this role is the difference between &quot;same as
              everyone else&quot; and &quot;a reason to read the CV.&quot; The specifics do the lifting. Your real
              achievements, the role&apos;s real requirements, the company&apos;s real context.
              Nothing invented.
            </p>,
      ),
    },
  ],
  faqs: [
    {
      q: 'How does an AI cover letter generator work?',
      a: "An AI cover letter generator analyzes the job description, extracts key requirements, maps them to your CV experience, and writes a personalized cover letter that explains your fit. Useful Apply generates cover letters in 90 seconds as part of a full application (CV, cover letter, application email, follow-up email).",
    },
    {
      q: 'Are AI-generated cover letters better than templates?',
      a: 'Yes. Templates are generic and easily recognized by hiring managers. AI-generated cover letters are tailored to the specific job description and your experience, referencing exact requirements and achievements. A letter that reads as written for this role beats one that could have been sent to any company.',
    },
    {
      q: 'Will the AI fabricate experience I don\'t have?',
      a: "Not if the tool has anti-hallucination safeguards. Useful Apply enforces strict traceability: every claim in the cover letter must map back to your uploaded CV. If you don't have AWS experience, the cover letter won't mention AWS. No fabricated skills or metrics.",
    },
    {
      q: 'How long is an AI-generated cover letter?',
      a: 'Useful Apply generates cover letters between 250 and 350 words (3 to 4 paragraphs). This length is optimal: long enough to demonstrate genuine interest and fit, short enough to be read in 90 seconds by a busy hiring manager.',
    },
    {
      q: 'Can I edit the AI-generated cover letter before sending?',
      a: 'Yes. Useful Apply outputs editable text. You can adjust tone, add company-specific details, or emphasize different achievements before downloading or copying. The AI gives you a strong starting point; you control the final version.',
    },
  ],
  faqSection: { bg: "bg-surface-raised", cardBg: "bg-surface" },
  cta: {
    heading: "Generate Your First AI Cover Letter Free",
    body:
      "Try Useful Apply free for your first 2 applications. Get a personalized cover letter in 90 seconds, plus tailored CV, application email, and follow-up email. No credit card required.",
    actions: <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <Link
        href="/dashboard"
        className="px-10 py-4 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control transition-colors duration-(--duration-fast) ease-standard shadow-floating text-lg inline-flex items-center gap-2"
      >
        Start free
      </Link>
      <Link
        href="/ai-job-application"
        className="px-10 py-4 border border-border-inverse-raised bg-ink-inverse/10 text-ink-inverse font-semibold rounded-control hover:bg-ink-inverse/20 transition-colors duration-(--duration-base) ease-standard text-lg inline-flex items-center gap-2"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Guide
      </Link>
    </div>,
  },
};
