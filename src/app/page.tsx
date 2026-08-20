import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { HeroAurora } from '@/components/marketing/HeroAurora';
import { PlanCards } from '@/components/marketing/PlanCards';

import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    absolute: 'Useful Apply | Your entire job search, in one app',
  },
  description:
    'Useful Apply is the AI job application agent that replaces the seven tools job seekers stitch together. A daily job feed, a fit check before you spend anything, and a tailored CV, cover letter and emails in 90 seconds. Every word traces back to your real CV.',
  alternates: { canonical: '/' },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || BRAND.url;

const MOMENTS = [
  {
    title: 'See the fit before you spend anything',
    body: "A score, what lines up, what's missing, and whether it's worth applying. The first check is free.",
    image: '/images/moments/fit-result.webp',
    alt: 'A fit result for a Product Manager role: 76% match, the strengths that line up and the gaps',
  },
  {
    title: 'A kit you can send, every claim from your CV',
    body: 'Tailored CV, cover letter, application email and follow-up. ATS-checked, with every change shown. Want it shorter? Just say so.',
    image: '/images/moments/kit-ats.webp',
    alt: 'The what-changed view of a tailored CV, showing each edit before and after with an ATS score',
  },
  {
    title: 'Roles picked for you, whenever you ask',
    body: 'Five on Free, twenty on Plus, once a day. One click checks the fit, one more writes the kit, and the tracker fills itself.',
    // PLACEHOLDER: still the flow-7 mock. The feed reads from the server, so the
    // real shot needs a signed-in account with a feed run. Replaced in the
    // end-to-end pass (BACKEND-GAPS, batch 5).
    image: '/images/moments/daily-feed.webp',
    alt: "A job feed listing today's roles with match strength, salary and a check-fit button on each",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-cream-100">
      {/* SoftwareApplication Schema (homepage only).
          Google requires aggregateRating or review for rich results.
          Add real review data here when available (e.g. from Trustpilot). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Useful Apply',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description:
              'AI-powered job application assistant with a daily job feed, fit analysis, tailored CVs, cover letters, emails, screening question answers, and application tracking.',
            url: SITE_URL,
            image: `${SITE_URL}/favicon-512x512.png`,
            featureList: [
              'Daily Job Feed',
              'AI CV Optimization',
              'Tailored Cover Letter Generation',
              'Professional Application Email Drafting',
              'Follow-Up Email Drafting',
              'AI Screening Question Answers',
              'Smart Fit Analysis',
              'Application Tracker',
              'ATS-Friendly Output',
              'Multi-Language Support',
              'Master CV Support',
            ],
            offers: [
              {
                '@type': 'Offer',
                name: 'Free',
                price: '0',
                priceCurrency: 'USD',
                description: '4 credits/month (~2 applications)',
              },
              {
                '@type': 'Offer',
                name: 'Plus',
                price: '19.99',
                priceCurrency: 'USD',
                description: '50 credits/month (~25 applications)',
              },
              {
                '@type': 'Offer',
                name: 'Max',
                price: '79.99',
                priceCurrency: 'USD',
                description: '200 credits/month (~100 applications)',
              },
            ],
            creator: {
              '@type': 'Organization',
              name: 'Useful Apply',
              url: SITE_URL,
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '5.0',
              reviewCount: '2',
              bestRating: '5',
            },
            review: [
              {
                '@type': 'Review',
                author: {
                  '@type': 'Person',
                  name: 'Mohammad Shafiq',
                },
                datePublished: '2026-03-08',
                reviewBody:
                  'Useful Apply is a very useful AI tool for job applications. It helps create a professional CV in the European and USA format and also assists with writing strong cover letters. The platform is easy to use and saves a lot of time when preparing job applications. I would definitely recommend it to anyone who wants to improve their CV and apply for jobs more efficiently.',
                reviewRating: {
                  '@type': 'Rating',
                  ratingValue: '5',
                  bestRating: '5',
                },
              },
              {
                '@type': 'Review',
                author: {
                  '@type': 'Person',
                  name: 'Zaeem Jalali',
                },
                datePublished: '2026-03-04',
                reviewBody:
                  'If you are someone whose looking for jobs like me this is the best site for you. It saves so much time and energy for you. You can create targeted CV, Cover Letter and Email + follow up email in a matter of seconds for any Job application you want.',
                reviewRating: {
                  '@type': 'Rating',
                  ratingValue: '5',
                  bestRating: '5',
                },
              },
            ],
          }),
        }}
      />
      <Navbar />
      <main>
        {/* Hero: one gold action into the guided line, the kit screen as the proof. */}
        <section className="relative overflow-hidden bg-cream-100 px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-20">
          <HeroAurora />
          <div className="relative mx-auto max-w-5xl text-center">
            <ScrollReveal delay={100}>
              <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-navy-800 sm:text-[50px] lg:text-[56px]">
                Your entire job search, <span className="text-gold-500">in one app.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={250}>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-warm-gray">
                Upload your CV, paste a job, see your fit. Then a tailored CV, cover letter and emails in 90
                seconds. Every word from your real CV, nothing invented.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={400}>
              <div className="mt-7 flex flex-col items-center">
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center rounded-full bg-gold-400 px-7 text-[15px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 cursor-pointer"
                >
                  Try it free
                </Link>
                <p className="mt-4 text-sm text-warm-gray">
                  Your first fit check is on us, no account needed.
                </p>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={550}>
            <div className="relative mx-auto mt-8 w-full max-w-[1040px]">
              <Image
                src="/images/moments/kit-ready.webp"
                alt="The Useful Apply workspace with a finished application kit: the conversation on the left and the tailored CV on the right"
                width={1440}
                height={900}
                priority
                className="w-full rounded-2xl border border-cream-200 shadow-lg"
              />
            </div>
          </ScrollReveal>
        </section>

        {/* Three moments, text beside the screen, sides alternating. */}
        <section id="what-you-get" className="scroll-mt-24 bg-cream-100 px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            {MOMENTS.map((moment, i) => (
              <ScrollReveal key={moment.title}>
                <div
                  className={`flex flex-col items-center gap-10 lg:flex-row lg:gap-16 ${
                    i % 2 === 1 ? 'lg:flex-row-reverse' : ''
                  }`}
                >
                  <div className="w-full lg:w-[320px] lg:flex-shrink-0">
                    <h2 className="text-[30px] font-semibold leading-[1.15] text-navy-800">
                      {moment.title}
                    </h2>
                    <p className="mt-4 text-[15px] leading-relaxed text-warm-gray">{moment.body}</p>
                  </div>
                  <div className="w-full lg:w-[680px]">
                    <Image
                      src={moment.image}
                      alt={moment.alt}
                      width={1440}
                      height={900}
                      className="w-full rounded-2xl border border-cream-200 shadow-md"
                    />
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* Founder note. */}
        <section className="bg-cream-100 px-4 py-6 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="mx-auto flex max-w-3xl items-start gap-6">
              <Image
                src="/wasim-founder.jpg"
                alt="Wasim Jalali, founder of Useful Apply"
                width={240}
                height={240}
                className="h-[120px] w-[120px] flex-shrink-0 rounded-2xl border border-cream-200 object-cover shadow-sm"
              />
              <div>
                <p className="text-[17px] leading-relaxed text-charcoal">
                  &ldquo;I built Useful Apply for my own search. Sixty-plus applications, every one written by
                  the product, five interviews, and the job I have now came from one of them.&rdquo;
                </p>
                <p className="mt-3 text-sm text-warm-gray">Wasim Jalali, founder</p>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* Plans. Same cards as the settings modal. */}
        <section className="bg-cream-100 px-4 py-10 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="mb-7 text-center text-[32px] font-semibold leading-[1.1] text-navy-800 md:text-[36px]">
              Start free. Pay when you&apos;re applying every week.
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <PlanCards />
          </ScrollReveal>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-navy-700 relative overflow-hidden">
          <div className="absolute inset-0 dot-grid opacity-[0.04]" />
          <ScrollReveal>
          <div className="max-w-3xl mx-auto text-center relative">
            <h2 className="font-bold text-white text-[36px] md:text-[48px] leading-[1.1] mb-5">
              Your next interview is <span className="text-gold-400">90 seconds away.</span>
            </h2>
            <p className="text-[17px] text-navy-100 mb-9 max-w-xl mx-auto leading-relaxed">
              Upload your CV. Pick a role from your feed. Send your first full application before your coffee gets cold.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="cta-gold px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 text-base group"
              >
                Start free, no credit card
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-3.5 border border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 hover:border-white/50 transition-all duration-200 hover:-translate-y-0.5 flex items-center justify-center text-base"
              >
                View pricing
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
