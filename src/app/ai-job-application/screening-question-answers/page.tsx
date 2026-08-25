import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';

import { SEO_SITE_URL } from '@/lib/seo/site-url';

const SITE_URL = SEO_SITE_URL;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'AI Screening Question Answers for Job Applications',
    description:
      'Get AI-generated answers to job application screening questions. Supports Workday, Greenhouse, Lever, and all major ATS platforms. Behavioral, situational, and free-text answers from your real CV.',
    canonical: '/ai-job-application/screening-question-answers',
  });
}

const faqs = [
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
];

export default function ScreeningQuestionAnswersPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'AI Job Application',
        item: `${SITE_URL}/ai-job-application`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Screening Question Answers',
        item: `${SITE_URL}/ai-job-application/screening-question-answers`,
      },
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'AI Screening Question Answers for Job Applications',
    description:
      'Get AI-generated answers to job application screening questions from Workday, Greenhouse, Lever, and all major ATS platforms.',
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/ai-job-application/screening-question-answers`,
    datePublished: '2026-04-19',
    dateModified: '2026-04-19',
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <main>
        {/* Breadcrumb */}
        <nav className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-2">
          <ol className="flex items-center gap-2 text-sm text-warm-gray">
            <li>
              <Link href="/" className="hover:text-navy-600 transition-colors">
                Home
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/ai-job-application" className="hover:text-navy-600 transition-colors">
                AI Job Application
              </Link>
            </li>
            <li>/</li>
            <li className="text-navy-600 font-medium">Screening Question Answers</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">AI Screening Question Answers</p>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
                AI Answers to Screening Questions, Tailored to Your CV
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-xl text-warm-gray max-w-3xl mx-auto leading-relaxed">
                Paste your screening questions from Workday, Greenhouse, Lever, or any ATS
                portal. Useful Apply generates concise, role-specific answers using your real
                experience. Behavioral, situational, yes/no, and free-text questions are all
                supported.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
                >
                  Start free
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* The Problem */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">The Problem</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Screening Questions Slow Down Every Application
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              Most ATS platforms ask 3 to 10 screening questions before you can submit your
              application. These range from simple eligibility checks (&quot;Are you authorized to
              work in the US?&quot;) to complex behavioral questions (&quot;Tell me about a time you
              led a cross-functional project&quot;).
            </p>
            <p className="text-charcoal leading-relaxed mb-4">
              Writing thoughtful answers takes 10 to 20 minutes per application. If you are
              applying to 50 jobs, that is 8 to 16 hours just on screening questions. Most job
              seekers either rush through with generic answers or skip applications that have too
              many questions.
            </p>
            <p className="text-charcoal leading-relaxed">
              <strong>Both approaches hurt your chances.</strong> Generic answers get filtered out.
              Skipping applications means missing good opportunities. You need answers that are
              specific, concise, and grounded in your actual experience.
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">How It Works</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Paste Questions, Get Answers in Seconds
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-6">
              After Useful Apply generates your full application (CV, cover letter, emails), a
              &quot;Screening Questions&quot; button appears in the chat. Click it, paste your
              questions, and receive formatted answers ready to copy into any ATS portal.
            </p>
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
            </div>
          </div>
        </section>

        {/* Question Types */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Smart Classification</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                The Right Length for Every Question Type
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-8">
              Useful Apply classifies each question and matches the response length to what recruiters
              expect. Short questions get short answers. Behavioral questions get structured STAR
              responses. Nothing is over-explained or padded.
            </p>
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
            </div>
          </div>
        </section>

        {/* Anti-Hallucination */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Zero Fabrication</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Every Answer Traces Back to Your CV
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              The AI only references skills, metrics, and qualifications that exist in your
              uploaded CV. If the question asks about a technology you have not used, the answer
              will not claim you have. Instead, it highlights transferable experience or a learning
              trajectory.
            </p>
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
            </div>
          </div>
        </section>

        {/* ATS Compatibility */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">ATS Compatible</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
                Built for Workday, Greenhouse, Lever, and More
              </h2>
            </ScrollReveal>
            <p className="text-charcoal leading-relaxed mb-4">
              ATS platforms enforce strict character limits on screening answer fields, typically
              500 to 1000 characters per field. Recruiters spend 6 to 10 seconds scanning each
              answer. Every answer Useful Apply generates is optimized for both constraints: short
              enough to fit the field, focused enough to make an impression in seconds.
            </p>
            <p className="text-charcoal leading-relaxed">
              The maximum answer length is 150 words (approximately 750 characters). Most answers
              are significantly shorter. Yes/no questions get 1 to 5 words. Numeric questions get
              one sentence. Even behavioral STAR answers stay under 150 words by focusing on the
              result and cutting filler.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <div className="text-center mb-10">
                <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">FAQ</p>
                <h2 className="text-3xl md:text-4xl font-bold text-navy-600">
                  Frequently Asked Questions
                </h2>
              </div>
            </ScrollReveal>
            <div className="space-y-6">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  itemScope
                  itemType="https://schema.org/Question"
                  className="bg-cream-50 rounded-xl border border-cream-200 p-6"
                >
                  <h3 itemProp="name" className="text-lg font-bold text-charcoal mb-3">
                    {faq.q}
                  </h3>
                  <div
                    itemScope
                    itemType="https://schema.org/Answer"
                    itemProp="acceptedAnswer"
                  >
                    <p itemProp="text" className="text-warm-gray leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gold-400/10 rounded-full -translate-y-1/2 translate-x-1/2 animate-float-slow" />
          <ScrollReveal>
            <div className="max-w-4xl mx-auto text-center relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Stop Writing Screening Answers by Hand
              </h2>
              <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
                Try Useful Apply free for your first 2 applications. Get a tailored CV, cover letter,
                emails, and screening question answers. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
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
              </div>
            </div>
          </ScrollReveal>
        </section>
      </main>

      <Footer />
    </div>
  );
}
