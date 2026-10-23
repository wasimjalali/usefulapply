import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { body } from '@/app/ai-job-application/_shared/body';
import type { GeoContent } from '@/app/ai-job-application/_shared/types';

export const content: GeoContent = {
  title: "AI Screening Question Answers for Job Applications",
  description:
    "Get AI-generated answers to job application screening questions. Supports Workday, Greenhouse, Lever, and all major ATS platforms. Behavioral, situational, and free-text answers from your real CV.",
  path: "/ai-job-application/screening-question-answers",
  crumb: "Screening Question Answers",
  published: "2026-04-19",
  modified: "2026-04-19",
  articleHeadline: "AI Screening Question Answers for Job Applications",
  articleDescription:
    "Get AI-generated answers to job application screening questions from Workday, Greenhouse, Lever, and all major ATS platforms.",
  hero: {
    eyebrow: "AI Screening Question Answers",
    title: "AI Answers to Screening Questions, Tailored to Your CV",
    lead:
      "Paste your screening questions from Workday, Greenhouse, Lever, or any ATS portal. Useful Apply generates concise, role-specific answers using your real experience. Behavioral, situational, yes/no, and free-text questions are all supported.",
    cta: { label: "Start free", arrow: false },
  },
  sections: [
    {
      bg: "bg-cream-50",
      eyebrow: "The Problem",
      heading: "Screening Questions Slow Down Every Application",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          Most ATS platforms ask 3 to 10 screening questions before you can submit your
          application. These range from simple eligibility checks (&quot;Are you authorized to
          work in the US?&quot;) to complex behavioral questions (&quot;Tell me about a time you
          led a cross-functional project&quot;).
        </p>,
        <p className="text-charcoal leading-relaxed mb-4">
          Writing thoughtful answers takes 10 to 20 minutes per application. If you are
          applying to 50 jobs, that is 8 to 16 hours just on screening questions. Most job
          seekers either rush through with generic answers or skip applications that have too
          many questions.
        </p>,
        <p className="text-charcoal leading-relaxed">
          <strong>Both approaches hurt your chances.</strong> Generic answers get filtered out.
          Skipping applications means missing good opportunities. You need answers that are
          specific, concise, and grounded in your actual experience.
        </p>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "How It Works",
      heading: "Paste Questions, Get Answers in Seconds",
      body: body(
        <p className="text-charcoal leading-relaxed mb-6">
          After Useful Apply generates your full application (CV, cover letter, emails), a
          &quot;Screening Questions&quot; button appears in the chat. Click it, paste your
          questions, and receive formatted answers ready to copy into any ATS portal.
        </p>,
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {[
            {
              step: '01',
              title: 'Generate Your Application',
              description: 'Upload your CV, paste the job description, and generate your full application as usual.',
            },
            {
              step: '02',
              title: 'Paste Your Questions',
              description: 'Click the Screening Questions button and paste the questions directly from the ATS portal.',
            },
            {
              step: '03',
              title: 'Copy and Submit',
              description: 'Each answer has its own copy button. Copy individual answers or all at once into the application form.',
            },
          ].map((card, i) => (
            <ScrollReveal key={i} delay={i * 150}>
              <div className="bg-cream-50 rounded-2xl border border-cream-200 p-6">
                <span className="text-3xl font-bold text-cream-300">{card.step}</span>
                <h3 className="text-lg font-bold text-navy-600 mt-3 mb-2">{card.title}</h3>
                <p className="text-warm-gray text-sm leading-relaxed">{card.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "Smart Classification",
      heading: "The Right Length for Every Question Type",
      body: body(
        <p className="text-charcoal leading-relaxed mb-8">
          Useful Apply classifies each question and matches the response length to what recruiters
          expect. Short questions get short answers. Behavioral questions get structured STAR
          responses. Nothing is over-explained or padded.
        </p>,
        <div className="space-y-4">
          {[
            {
              type: 'Yes/No and Eligibility',
              example: '"Are you authorized to work in the US?"',
              length: '1 to 5 words',
              description: 'Direct answer only. No unnecessary elaboration.',
            },
            {
              type: 'Numeric and Factual',
              example: '"How many years of Python experience do you have?"',
              length: 'Under 20 words',
              description: 'States the number or fact with brief context when it strengthens the answer.',
            },
            {
              type: 'Short Answer',
              example: '"Why are you interested in this role?"',
              length: '50 to 80 words',
              description: 'Connects your specific background to the role in 2 to 3 sentences. Leads with the strongest qualifier.',
            },
            {
              type: 'Behavioral (STAR)',
              example: '"Tell me about a time you resolved a conflict on your team."',
              length: '100 to 150 words',
              description: 'Compressed STAR format: situation and task in one sentence, action in two sentences, result with a quantified outcome.',
            },
            {
              type: 'Situational',
              example: '"How would you handle a tight deadline with incomplete requirements?"',
              length: '75 to 120 words',
              description: 'States the approach in 2 to 3 steps and references a similar past success from your CV.',
            },
          ].map((item, i) => (
            <ScrollReveal key={i} delay={i * 80}>
              <div className="bg-white rounded-xl border border-cream-200 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                  <h3 className="text-lg font-bold text-navy-600">{item.type}</h3>
                  <span className="inline-block px-2.5 py-0.5 bg-cream-50 border border-cream-200 rounded text-xs font-medium text-charcoal">
                    {item.length}
                  </span>
                </div>
                <p className="text-sm text-warm-gray italic mb-2">{item.example}</p>
                <p className="text-charcoal text-sm leading-relaxed">{item.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>,
      ),
    },
    {
      bg: "bg-white",
      eyebrow: "Zero Fabrication",
      heading: "Every Answer Traces Back to Your CV",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          The AI only references skills, metrics, and qualifications that exist in your
          uploaded CV. If the question asks about a technology you have not used, the answer
          will not claim you have. Instead, it highlights transferable experience or a learning
          trajectory.
        </p>,
        <div className="grid sm:grid-cols-2 gap-5 mt-8">
          {[
            'Only references skills from your real CV',
            'Dates, titles, and metrics match your uploaded documents',
            'Keywords from the job description are used naturally, not forced',
            'One specific example is always better than three vague claims',
            'Answers stay consistent with your generated CV and cover letter',
            'Multi-language support: answers match the question language',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Check className="w-5 h-5 text-gold-500 mt-0.5 flex-shrink-0" />
              <span className="text-charcoal text-sm leading-relaxed">{item}</span>
            </div>
          ))}
        </div>,
      ),
    },
    {
      bg: "bg-cream-50",
      eyebrow: "ATS Compatible",
      heading: "Built for Workday, Greenhouse, Lever, and More",
      body: body(
        <p className="text-charcoal leading-relaxed mb-4">
          ATS platforms enforce strict character limits on screening answer fields, typically
          500 to 1000 characters per field. Recruiters spend 6 to 10 seconds scanning each
          answer. Every answer Useful Apply generates is optimized for both constraints: short
          enough to fit the field, focused enough to make an impression in seconds.
        </p>,
        <p className="text-charcoal leading-relaxed">
          The maximum answer length is 150 words (approximately 750 characters). Most answers
          are significantly shorter. Yes/no questions get 1 to 5 words. Numeric questions get
          one sentence. Even behavioral STAR answers stay under 150 words by focusing on the
          result and cutting filler.
        </p>,
      ),
    },
  ],
  faqs: [
    {
      q: 'What types of screening questions can Useful Apply answer?',
      a: 'Useful Apply handles five types: yes/no and eligibility questions (work authorization, relocation), numeric and factual questions (years of experience, salary, start date), short-answer qualitative questions, behavioral questions using the STAR method, and situational or hypothetical questions. Each type gets a response length matched to what recruiters expect.',
    },
    {
      q: 'Will the AI make up experience I do not have?',
      a: 'No. Useful Apply only references skills, metrics, and experience that exist in your uploaded CV. If you do not have AWS experience, the answer will not mention AWS. For skills you lack, the AI briefly acknowledges transferable experience instead of fabricating claims.',
    },
    {
      q: 'Do the answers fit within ATS character limits?',
      a: 'Yes. ATS platforms like Workday and Greenhouse typically enforce 500 to 1000 character limits per answer field. Every answer Useful Apply generates stays under 750 characters (approximately 150 words). Most answers are significantly shorter based on question type.',
    },
    {
      q: 'How many questions can I answer per session?',
      a: 'You can paste up to 7 screening questions per session. If you have more, the AI will answer the first 7 and prompt you to send the rest in a follow-up message. You get 2 screening sessions per application.',
    },
    {
      q: 'Is this feature available on all plans?',
      a: 'Screening question answers are available on Plus ($19.99/month, 50 credits) and Max ($79.99/month, 200 credits). Both paid plans include up to 2 screening sessions per application. The Free plan does not include screening answers.',
    },
    {
      q: 'Does it work in languages other than English?',
      a: 'Yes. Useful Apply detects the language of your screening questions and responds in the same language. If your questions are in German, the answers will be in German. This works for all supported languages.',
    },
  ],
  faqSection: { bg: "bg-white", cardBg: "bg-cream-50" },
  cta: {
    heading: "Stop Writing Screening Answers by Hand",
    body:
      "Try Useful Apply free for your first 2 applications. Get a tailored CV, cover letter, emails, and screening question answers. No credit card required.",
    actions: <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <Link
        href="/dashboard"
        className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg inline-flex items-center gap-2"
      >
        Start free
      </Link>
      <Link
        href="/ai-job-application"
        className="px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/30 hover:shadow-xl hover:scale-[1.02] hover:border-gold-400/50 transition-all duration-300 text-lg inline-flex items-center gap-2"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Guide
      </Link>
    </div>,
  },
};
