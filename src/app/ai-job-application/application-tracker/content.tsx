import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

export const content: GeoContent = {
  title: "Job Application Tracker: Track 100+ Applications",
  description:
    "Track job applications with status, match scores, and deadlines. Useful Apply automatically saves every application you generate. Stay organized throughout your job search.",
  path: "/ai-job-application/application-tracker",
  crumb: "Application Tracker",
  published: "2026-02-24",
  modified: "2026-03-30",
  articleHeadline: "Job Application Tracker: Stay Organized Through 100+ Applications",
  articleDescription:
    "Learn how Useful Apply's application tracker automatically saves your applications, match scores, and documents. Stay organized and never miss a follow-up.",
  hero: {
    eyebrow: "Job Application Tracker",
    title: "Job Application Tracker: Stay Organized Through 100+ Applications",
    lead:
      "The average job seeker submits 100+ applications to land one offer. Without a tracker, you lose track of which jobs you applied to, when to follow up, and which version of your CV you sent. Useful Apply automatically saves every application you generate, recording the company, role, match score, and documents, so you stay organized through your entire job search.",
    cta: { label: "Start Tracking Applications Free", arrow: true },
  },
  sections: [
    {
      bg: "bg-surface",
      eyebrow: "The Problem",
      heading: "Why You Need a Job Application Tracker",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          In 2026, the average job seeker needs to submit <strong>100+ applications to land
          one offer.</strong> Some studies put that number at 200 or more, depending on the
          industry and role.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          At that volume, you can&apos;t rely on memory. You can&apos;t remember which
          companies you applied to 3 weeks ago. You can&apos;t remember when you&apos;re
          supposed to follow up. You can&apos;t remember which version of your CV you sent to
          which employer. And you definitely can&apos;t remember which claims you made in
          which cover letter when the interview finally comes 6 weeks later.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>A job application tracker solves this.</strong> It keeps a log of
          everything you&apos;ve applied to, when you applied, what happened, and what you
          sent. It helps you avoid duplicate applications (applying to the same role twice
          looks terrible). It reminds you when to follow up. And it gives you data on what
          works: which types of roles or companies respond most often.
        </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Essential Fields",
      heading: "What Should a Good Application Tracker Include?",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          A minimal tracker needs these fields:
        </p>,
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-ink-body mb-2">Company Name</h3>
            <p className="text-ink-muted leading-relaxed">
              So you know where you applied.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-ink-body mb-2">Job Title</h3>
            <p className="text-ink-muted leading-relaxed">
              So you know which role (especially if applying to multiple roles at the same
              company).
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-ink-body mb-2">Application Date</h3>
            <p className="text-ink-muted leading-relaxed">
              So you know when to follow up (7 to 10 business days later).
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-ink-body mb-2">Status</h3>
            <p className="text-ink-muted leading-relaxed">
              Applied, Interview, Rejected, Accepted, Follow-Up, so you know where each
              application stands.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-ink-body mb-2">Job Posting Link</h3>
            <p className="text-ink-muted leading-relaxed">
              So you can re-read the JD before the interview.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-ink-body mb-2">Documents Sent</h3>
            <p className="text-ink-muted leading-relaxed">
              A copy of the CV and cover letter you sent, so you know what claims you made.
            </p>
          </div>
        </div>,
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>Helpful additions:</strong>
        </p>,
        <ul className="list-disc list-inside space-y-2 text-ink-body mb-4 pl-4">
          <li><strong>Match score:</strong> How well your profile fits the role (helps you prioritize follow-ups).</li>
          <li><strong>Follow-up deadline:</strong> Automatically calculated (application date + 7 to 10 days).</li>
          <li><strong>Notes:</strong> Recruiter name, conversation notes, next steps.</li>
          <li><strong>Source:</strong> Where you found the job (LinkedIn, Indeed, company website, referral).</li>
        </ul>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "Automatic Tracking",
      heading: "How Useful Apply's Application Tracker Works",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>Useful Apply automatically saves every application you generate.</strong> You
          don&apos;t have to manually log anything. The tracker is built into the workflow.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          When you generate an full application (CV, cover letter, email, follow-up), Useful Apply
          AI records:
        </p>,
        <ul className="list-disc list-inside space-y-2 text-ink-body mb-4 pl-4">
          <li>Company name and job title (extracted from the job description)</li>
          <li>Application date (timestamp)</li>
          <li>Match score (the fit assessment from Phase 1)</li>
          <li>The exact documents you generated (CV, cover letter, email, follow-up)</li>
          <li>Status (defaults to &quot;Applied,&quot; you can update it later)</li>
        </ul>,
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>Everything is saved to your account</strong>. You can access your full application history from the Applications page
          in the Useful Apply dashboard. You can update the status (e.g., from &quot;Applied&quot; to
          &quot;Interview&quot;), add notes, and filter by status, date, or match score.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>Follow-up reminders:</strong> The tracker shows you which applications are
          7 to 10 days old and haven&apos;t received a response, so you know when to send your
          follow-up email.
        </p>,
      ),
    },
    {
      bg: "bg-surface-raised",
      eyebrow: "Efficiency",
      heading: "Why Automatic Tracking Beats Manual Spreadsheets",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          Many job seekers start with a Google Sheet or Excel file. They manually log each
          application: company, job title, date, status.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>This works until it doesn&apos;t.</strong> At 10 applications,
          it&apos;s manageable. At 50 applications, you start forgetting to update the
          spreadsheet. At 100 applications, the spreadsheet is out of sync with reality. You
          forget to log an application. You forget to update the status. You lose the link to
          the CV you sent.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>Automatic tracking eliminates this friction.</strong> You don&apos;t have
          to remember to log anything. The tracker updates itself as part of the application
          generation workflow. You can&apos;t forget, because it&apos;s built in.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          And because Useful Apply saves the exact documents you generated, you can go back 6
          weeks later when the interview comes and review exactly what you said in your cover
          letter and which achievements you emphasized in your CV. That prep time is critical.
        </p>,
      ),
    },
    {
      bg: "bg-surface",
      eyebrow: "Optimization",
      heading: "Using Your Tracker to Optimize Your Job Search Strategy",
      body: body(
        <p className="text-ink-body leading-relaxed mb-4">
          A tracker isn&apos;t just a log. It&apos;s data. And data lets you optimize.
        </p>,
        <p className="text-ink-body leading-relaxed mb-4">
          After 50 applications, you can start seeing patterns:
        </p>,
        <ul className="list-disc list-inside space-y-2 text-ink-body mb-4 pl-4">
          <li><strong>Which types of roles respond most often?</strong> If you&apos;re getting interviews for &quot;Data Analyst&quot; but not &quot;Data Scientist,&quot; shift your applications accordingly.</li>
          <li><strong>Which companies respond fastest?</strong> Startups might respond in 3 days. Enterprises might take 3 weeks. Adjust your follow-up timing.</li>
          <li><strong>What match score threshold works?</strong> If you&apos;re getting interviews for 75%+ matches but not 60% matches, focus on higher-match roles.</li>
          <li><strong>Which application sources work best?</strong> LinkedIn Easy Apply might have a 2% response rate. Direct company websites might have 6%. Double down on what works.</li>
        </ul>,
        <p className="text-ink-body leading-relaxed mb-4">
          <strong>Most job seekers never do this analysis</strong> because they don&apos;t
          have clean data. Useful Apply&apos;s tracker gives you that data automatically.
        </p>,
      ),
    },
  ],
  faqs: [
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
      a: 'Useful Apply automatically saves every application you generate to your tracker. It records the company, job title, application date, match score (fit assessment), and the exact documents you generated (CV, cover letter, email, follow-up). You can update the status (applied → interview → offer) and add notes. Everything is saved to your account and available from the Applications page.',
    },
    {
      q: 'Can I export my application data?',
      a: 'Your applications live in your Useful Apply account and stay available from the Applications page. There is no separate export dashboard. You keep the documents you generated (CV, cover letter, emails) and can download them from the kit at any time.',
    },
    {
      q: 'What\'s the difference between a tracker and a CRM for job search?',
      a: 'A tracker is a simple log: what you applied to, when, and what happened. A CRM (Customer Relationship Management tool) is more complex, tracking relationships, conversations, and multi-stage pipelines. For most job seekers, a tracker is sufficient. If you\'re networking heavily or managing 20+ active conversations with recruiters, a CRM might help, but it\'s overkill for standard applications.',
    },
  ],
  faqSection: { bg: "bg-surface-raised", cardBg: "bg-surface" },
  cta: {
    heading: "Start Tracking Your Applications Automatically",
    body:
      "Try Useful Apply free for your first 2 applications. Every application you generate is automatically saved to your tracker. No manual logging. Stay organized from day one.",
    actions: <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <Link
        href="/dashboard"
        className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-accent-ink font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-floating text-lg inline-flex items-center gap-2"
      >
        Start free
      </Link>
      <Link
        href="/ai-job-application"
        className="px-10 py-4 glass-dark text-ink-inverse font-semibold rounded-xl hover:bg-ink-inverse/30 hover:shadow-xl hover:scale-[1.02] hover:border-accent/50 transition-all duration-300 text-lg inline-flex items-center gap-2"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Guide
      </Link>
    </div>,
  },
};
