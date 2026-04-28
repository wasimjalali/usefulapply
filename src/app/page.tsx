import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import { PlusPlanButton, MaxPlanButton } from '@/components/marketing/HomePricingButtons';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { TimeSavingsCalculator } from '@/components/marketing/TimeSavingsCalculator';
import { PlatformScrollStack } from '@/components/marketing/PlatformScrollStack';
import { SectionBackground } from '@/components/marketing/AnimatedBackground';
import { HeroAurora } from '@/components/marketing/HeroAurora';
import { PricingAurora } from '@/components/marketing/PricingAurora';

export const metadata: Metadata = {
  title: {
    absolute: 'KarKo AI | AI-Powered Job Application Assistant',
  },
  description:
    'AI-powered job application assistant: Generate ATS-optimized CV, cover letter, and application emails in 90 seconds. Free for 2 applications. Try now.',
  alternates: { canonical: '/' },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

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
            name: 'KarKo AI',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description:
              'AI-powered job application assistant that generates a tailored CV, cover letter, and application email from any job description in under 90 seconds.',
            url: SITE_URL,
            image: `${SITE_URL}/karko-ai.png`,
            featureList: [
              'AI CV Optimization',
              'Tailored Cover Letter Generation',
              'Professional Application Email Drafting',
              'Smart Fit Analysis',
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
              name: 'KarKo AI',
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
                  'Karko is a very useful AI tool for job applications. It helps create a professional CV in the European and USA format and also assists with writing strong cover letters. The platform is easy to use and saves a lot of time when preparing job applications. I would definitely recommend it to anyone who wants to improve their CV and apply for jobs more efficiently.',
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
      {/* Hero Section — text-only, centered, with premium aurora background */}
      <section className="pt-24 pb-20 lg:pt-32 lg:pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-cream-100">
        <HeroAurora />
        <div className="max-w-4xl mx-auto text-center relative">
          <ScrollReveal delay={100}>
          <h1 className="font-bold text-navy-600 text-[44px] sm:text-[56px] lg:text-[64px] leading-[1.05] tracking-tight mb-6">
            Your whole job search,{' '}
            <span className="text-gold-500">in one place.</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={250}>
          <p className="text-lg lg:text-xl text-warm-gray mb-9 max-w-2xl mx-auto leading-relaxed">
            Karko finds hand-picked jobs every morning, writes your CV, cover letter and emails in 90 seconds, and tracks every application. From search to interview, one app.
          </p>
          </ScrollReveal>
          <ScrollReveal delay={400}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-7 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex items-center justify-center gap-2 text-base group"
            >
              Start free, no credit card
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <Link
              href="#how-it-works"
              className="px-5 py-3.5 border border-white/70 bg-white/60 hover:bg-white hover:border-white hover:shadow-md text-navy-600 font-semibold rounded-lg transition-all duration-200 hover:-translate-y-0.5 flex items-center justify-center gap-1.5 text-base group"
            >
              See how it works <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-6 px-4 sm:px-6 lg:px-8 bg-white border-y border-cream-200 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal direction="none">
          <p className="text-center text-xs font-medium text-warm-gray uppercase tracking-widest mb-5">Optimized for the tools recruiters use</p>
          </ScrollReveal>
          <div className="relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
            <div className="flex items-center animate-scroll-logos">
              {[...Array(2)].map((_, setIdx) => (
                <div key={setIdx} className="flex items-center shrink-0">
                  {['Workday', 'Greenhouse', 'Lever', 'SAP SuccessFactors', 'iCIMS', 'Taleo', 'BambooHR', 'SmartRecruiters'].map((name, i) => (
                    <div key={`${setIdx}-${i}`} className="flex items-center shrink-0 mx-6 md:mx-10">
                      <span className="text-base md:text-lg font-bold tracking-tight text-navy-600/40 whitespace-nowrap">{name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-3xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">How It Works</p>
            <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-3">
              Five steps. One complete application.
            </h2>
            <p className="text-warm-gray text-lg max-w-xl mx-auto">
              From your CV to a tracked application, with hand-picked jobs in between.
            </p>
          </div>
          </ScrollReveal>

          <ol className="relative">
            {[
              {
                step: 1,
                title: 'Upload your CV once',
                description: 'Your source of truth. Karko reads your real experience and keeps it ready for every application.',
                accent: null,
              },
              {
                step: 2,
                title: 'Get jobs picked for you',
                description: 'Every morning, hand-picked roles arrive in your feed, matched to your profile.',
                accent: '/images/gpt-03-compass-card.webp',
                accentAlt: 'Compass brand illustration',
              },
              {
                step: 3,
                title: 'See how well you fit',
                description: 'An honest match score and skill-gap read, so you know where to focus before spending credits.',
                accent: null,
              },
              {
                step: 4,
                title: 'Get your complete application',
                description: 'Tailored CV, cover letter, application email and follow-up email in under 90 seconds.',
                accent: '/images/gpt-04-email-seal.webp',
                accentAlt: 'Email seal brand illustration',
              },
              {
                step: 5,
                title: 'Track and follow up',
                description: 'Every application stored with match score, status and a ready-to-send follow-up email.',
                accent: '/images/gpt-05-checklist-tracker.webp',
                accentAlt: 'Checklist brand illustration',
              },
            ].map((s, i, arr) => (
              <li key={s.step} className="relative pl-16 md:pl-20 pb-10 last:pb-0">
                {/* vertical line */}
                {i < arr.length - 1 && (
                  <span className="absolute left-5 md:left-6 top-12 bottom-0 w-[2px] bg-cream-300" aria-hidden="true" />
                )}
                {/* numbered circle */}
                <span className="absolute left-0 top-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-navy-600 text-white font-bold text-lg md:text-xl flex items-center justify-center shadow-sm">
                  {s.step}
                </span>
                {/* content */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                  <div className="md:flex-1">
                    <h3 className="font-bold text-navy-600 text-xl md:text-2xl leading-snug mb-1.5">
                      {s.title}
                    </h3>
                    <p className="text-warm-gray text-[15px] leading-relaxed max-w-lg">
                      {s.description}
                    </p>
                  </div>
                  {s.accent && (
                    <div className="flex-shrink-0 w-[120px] h-[120px] rounded-2xl bg-white border border-cream-200 overflow-hidden flex items-center justify-center">
                      <Image
                        src={s.accent}
                        alt={s.accentAlt ?? ''}
                        width={120}
                        height={120}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Platform scroll-stack — three panels that pin and layer as you scroll */}
      <PlatformScrollStack />

      {/* Founder Story — signed-card aesthetic, copy unchanged */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
          <div className="grid md:grid-cols-[240px_1fr] gap-10 md:gap-14 items-start">
            {/* Signed-card photo column */}
            <div className="flex flex-col items-center md:items-start">
              <div className="w-[200px] h-[200px] md:w-[240px] md:h-[240px] rounded-2xl overflow-hidden border border-cream-200 shadow-sm">
                <Image
                  src="/wasim-founder.jpg"
                  alt="Wasim Jalali, Founder of Karko AI"
                  width={240}
                  height={240}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="mt-5 italic text-charcoal text-2xl leading-none">Wasim Jalali</p>
              <p className="mt-1 text-sm text-warm-gray">Founder, Karko AI</p>
            </div>

            {/* Quote column */}
            <div>
              <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">
                A note from the founder
              </p>
              <h2 className="font-bold text-navy-600 text-[28px] md:text-[32px] leading-[1.15] mb-6">
                The tool I wished I had.
              </h2>
              <div className="border-l-2 border-gold-400 pl-6 space-y-4">
                <p className="text-[17px] md:text-[18px] text-charcoal leading-relaxed">
                  I ran out of money building a startup in Germany. No savings, no degree to fall back on. Generic job applications got me zero interviews. Tailoring each one by hand took 45 to 60 minutes, and it still was not fast enough.
                </p>
                <p className="text-[17px] md:text-[18px] text-charcoal leading-relaxed">
                  So I built Karko AI to do the entire workflow automatically. Paste a job description, get a tailored CV, cover letter, and professional email in under 90 seconds. Within about 20 applications, I got my first interview. That&apos;s when I knew every job seeker needed this.
                </p>
              </div>
              <div className="mt-6">
                <Link
                  href="/blog/how-long-to-apply-for-job-2026"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-gold-600 underline underline-offset-4 decoration-cream-300 hover:decoration-gold-400 transition-colors"
                >
                  Read the full story
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Time Savings Calculator */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
        <SectionBackground intensity="light" variant={0} sectionColor="#FEFDFB" />
        <div className="max-w-4xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Time Savings</p>
            <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-3">
              How much time will you save?
            </h2>
            <p className="text-warm-gray max-w-lg mx-auto">
              Each tailored application takes 45 to 60 minutes by hand. Karko does it in under 90 seconds.
            </p>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <TimeSavingsCalculator />
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing teaser — 3-tile summary, links to /pricing for full compare */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-100 relative overflow-hidden">
        <PricingAurora />
        <div className="max-w-5xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Pricing</p>
            <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-3">
              Pricing made simple.
            </h2>
            <p className="text-warm-gray text-lg max-w-xl mx-auto">
              Start free. Upgrade when you&apos;re applying every day.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Free tile */}
            <ScrollReveal delay={0}>
            <div className="bg-cream-50 border border-navy-200 rounded-2xl p-6 shadow-sm h-full flex flex-col">
              <div className="h-[22px]" />
              <p className="text-sm font-semibold text-navy-600">Free</p>
              <p className="text-[22px] font-bold text-charcoal mt-1">$0 / month</p>
              <p className="text-[15px] text-warm-gray mt-2 mb-5 flex-1">2 applications / month. Save ~2 hrs.</p>
              <Link
                href="/dashboard"
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-navy-300 bg-white hover:bg-navy-50 hover:border-navy-400 hover:shadow-md text-navy-600 font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 group"
              >
                Start Free <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>
            </ScrollReveal>

            {/* Plus tile (highlighted) */}
            <ScrollReveal delay={100}>
            <div className="bg-cream-50 border-2 border-gold-400 rounded-2xl p-6 shadow-xl h-full flex flex-col relative">
              <div className="h-[22px] flex items-center">
                <span className="text-[10px] font-bold tracking-[0.14em] text-gold-600 uppercase">Most popular</span>
              </div>
              <p className="text-sm font-semibold text-navy-600">Plus</p>
              <p className="text-[22px] font-bold text-charcoal mt-1">$19.99<span className="text-sm font-normal text-warm-gray"> / month</span></p>
              <p className="text-[15px] text-warm-gray mt-2 mb-5 flex-1">25 applications / month. Save ~18 hrs.</p>
              <PlusPlanButton />
            </div>
            </ScrollReveal>

            {/* Max tile */}
            <ScrollReveal delay={200}>
            <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6 shadow-sm h-full flex flex-col">
              <div className="h-[22px]" />
              <p className="text-sm font-semibold text-navy-300">Max</p>
              <p className="text-[22px] font-bold text-white mt-1">$79.99<span className="text-sm font-normal text-navy-300"> / month</span></p>
              <p className="text-[15px] text-navy-300 mt-2 mb-5 flex-1">100 applications / month. Save ~108 hrs.</p>
              <MaxPlanButton />
            </div>
            </ScrollReveal>
          </div>

          <div className="text-center mt-8">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-gold-600 underline underline-offset-4 decoration-cream-300 hover:decoration-gold-400 transition-colors"
            >
              Compare all plans and features
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
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
            Start with 2 free applications. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex items-center justify-center gap-2 text-base group"
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
