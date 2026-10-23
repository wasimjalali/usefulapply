import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

export const content: GeoContent = {
  title: "Workday, Greenhouse & Lever Compatibility",
  description:
    "How Useful Apply documents work in Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, and Taleo. Upload, parsing, and copy-paste ready.",
  path: "/ai-job-application/integrations-workday-greenhouse-lever",
  crumb: "Workday, Greenhouse & Lever",
  published: "2026-02-24",
  modified: "2026-03-29",
  articleHeadline: "AI Job Applications for Workday, Greenhouse & Lever: Compatibility Guide",
  articleDescription:
    "How Useful Apply's generated documents work in Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, and Taleo. Upload workflows, parsing, and copy-paste compatibility.",
  hero: {
    eyebrow: "ATS Integrations",
    title: "AI Job Applications for Workday, Greenhouse & Lever",
    lead:
      "Compatible with Workday, Greenhouse, and Lever means the AI-generated documents can be uploaded, parsed, and submitted through these systems without reformatting. Useful Apply produces ATS-optimized output: single-column CV structure, clean text for cover letter fields, and ready-to-paste email templates, all designed for how these systems ingest applications.",
    cta: { label: "Try ATS-Compatible Applications Free", arrow: true },
  },
  sections: [
    {
      bg: "bg-cream-50",
      eyebrow: "Compatibility",
      heading: "What \"Compatible\" Really Means",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Compatibility is not about a software integration. It means: (1) the CV can be
          uploaded and parsed with correct work history, job titles, education, and skills
          populated in the right ATS fields; (2) cover letter and cover text can be copy-pasted
          into text fields without formatting breaking; (3) the application email is ready for
          use when the process switches to email submission.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          This is what Useful Apply optimizes for: not a built-in connector, but documents that
          work cleanly in real ATS workflows.
        </p>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "Workday",
      heading: "Workday: What to Expect",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Workday forms often include 10 to 40 required fields that must be populated from your CV
          data. The most reliable upload path: a clean single-column CV without tables or text
          boxes. After upload, verify that employer names, job titles, and dates in the work
          history fields are correctly parsed.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          If fields are incorrect, the clean-text version of your CV sections can be copy-pasted
          directly. Useful Apply generates the CV in ATS-safe format by default to reduce this
          correction step.
        </p>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "Greenhouse & Lever",
      heading: "Greenhouse & Lever: Key Differences",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Greenhouse and Lever are commonly used by tech companies and startups, especially in
          the US market. Both support PDF and Word uploads with generally cleaner parsing than
          older systems. Both also frequently use custom questions and text fields for skills,
          cover letters, or motivation answers.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          Useful Apply&apos;s cover letter and application email serve as the content source for
          these fields. They are written to be adaptable to both full-document and
          text-field use cases.
        </p>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "Quick Check",
      heading: "The 2-Minute Compatibility Check",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Before submitting any application: (1) Upload the CV and check that work history, job
          titles, and education appear correctly in the ATS-populated fields. (2) Copy a skills
          section into a text field. If formatting breaks, the source document layout is too
          complex.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          (3) Confirm a plain-text cover letter version is available. (4) Keep the application
          email and follow-up email as separate text files for use when the process requires
          email rather than portal submission.
        </p>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "Enterprise ATS",
      heading: "SAP SuccessFactors, iCIMS, and Taleo",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          These enterprise ATS platforms are common in large organizations across all markets.
          They&apos;re generally stricter about formatting than Greenhouse or Lever.
          Single-column layout and standard section headings are particularly important for clean
          parsing in these systems.
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          Useful Apply&apos;s ATS-optimized templates are designed with these constraints in mind.
        </p>,
      ),
    },
  ],
  links: {
    bg: "",
    items: [
      { href: "/ai-job-application/ats-optimization", label: "ATS Optimization: Keywords & Format" },
      { href: "/ai-job-application/pricing-credits", label: "Pricing for High-Volume Applications" },
    ],
  },
  faqs: [
    {
      q: 'Which AI job application tool works well with Workday?',
      a: "Useful Apply generates documents in Workday-compatible format (single-column CV, standard section headings, clean date formats) specifically designed to parse correctly when uploaded to Workday's recruiting forms.",
    },
    {
      q: 'Does Useful Apply integrate directly with Workday or Greenhouse?',
      a: 'No. Useful Apply is not a Workday or Greenhouse plugin. It generates ATS-optimized documents that upload and parse correctly in these systems. Think of it as producing the right input, not automating the submission step.',
    },
    {
      q: 'What CV format works best for Workday uploads?',
      a: 'Single-column layout, no tables for critical content, standard section headings, consistent date formats, and system fonts like Arial. Useful Apply applies all of these constraints in its generated CVs.',
    },
    {
      q: "How do I use Useful Apply's output in Greenhouse application forms?",
      a: 'Upload the tailored CV as your resume file. Use the cover letter content for any cover letter field. For custom text questions about motivation or specific skills, the cover letter and application email provide ready-to-adapt paragraphs. The follow-up email is saved separately for use 7 to 10 days after submitting.',
    },
    {
      q: 'Does the generated output work for US and EU ATS systems?',
      a: 'Yes. Useful Apply supports both markets. US and UK applications use standard resume format (typically 1 to 2 pages). German applications use Lebenslauf format with the appropriate German-market header structure. The ATS compatibility considerations are the same across markets.',
    },
  ],
  faqSection: { bg: "bg-cream-50", cardBg: "bg-white" },
  cta: {
    heading: "Generate Your ATS-Ready Package",
    body:
      "Documents optimized for Workday, Greenhouse, Lever, and more. Ready to upload in under 90 seconds.",
    button: { label: "Generate Your ATS-Ready Package", arrow: true },
  },
};
